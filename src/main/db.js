'use strict';

// SQLite data layer, backed by sql.js (SQLite compiled to WebAssembly).
//
// Why sql.js: it needs no native compilation or ABI rebuild, so it installs and
// runs anywhere Node does. The database lives in memory and is persisted to disk
// (debounced) by exporting the full byte image after writes. For a larger app,
// swapping in better-sqlite3 means changing only this file.
//
// The schema deliberately mirrors the shape a mature Markdown notes app converges
// on: a single `text` field is the source of truth, and tags / todos / links are
// *derived* from that text and stored as related rows so they can be queried and
// indexed. Encryption columns exist now (unused until the encryption module lands)
// so the on-disk format is forward-compatible.

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const initSqlJs = require('sql.js');

let db;
let dbFile;
let persistTimer = null;

// Seeded into a fresh library — a Bear-style tour of what the editor supports.
const WELCOME_NOTE = [
  '# Welcome to Notewell 👋',
  '',
  'Notewell is a local-first Markdown notes app. This note is a quick tour — edit it however you like, or press **⌘N** to start your own.',
  '',
  '## Formatting',
  '',
  'Write **bold**, *italic*, ~~strikethrough~~, and `inline code`. You can even mix them for ***bold italic***.',
  '',
  '> Blockquotes are handy for a highlighted thought.',
  '> — someone wise',
  '',
  '## Lists',
  '',
  '- A simple bullet',
  '- Another one',
  '    - A nested bullet (indent four spaces)',
  '- Back to the top level',
  '',
  '1. First step',
  '2. Second step',
  '3. Third step',
  '',
  '## Tasks',
  '',
  '- [ ] An open task',
  '- [x] A finished task',
  '- [ ] Toggle me by editing the brackets',
  '',
  '## Code',
  '',
  'Inline like `const answer = 42`, or a fenced block:',
  '',
  '```js',
  'function greet(name) {',
  '  return `Hello, ${name}!`;',
  '}',
  '```',
  '',
  '## Links, tags & backlinks',
  '',
  '- A web link: [Notewell on the web](https://example.com)',
  '- A tag: #welcome — click it in the sidebar to filter',
  '- A note link: [[Another note]] — wiki-style backlinks',
  '',
  '## Tables',
  '',
  '| Action | Shortcut |',
  '| --- | --- |',
  '| New note | ⌘N |',
  '| Search | ⌘F |',
  '| Lock / Unlock | ⌘L |',
  '| Live / Markdown | ⌘\\ |',
  '',
  '---',
  '',
  '## A few tips',
  '',
  '- Switch between **Live** and **Markdown** modes from the top-right.',
  '- Change the look with the **appearance** button — there are nine themes.',
  '- **Lock** a note with **⌘L** to encrypt it behind a passphrase.',
  '- Drag the window edges; your size and position are remembered.',
  '',
  'Happy writing! #notewell',
  '',
].join('\n');

const ANOTHER_NOTE = [
  '# Another note 📝',
  '',
  'This note is linked from [[Welcome to Notewell 👋]].',
  '',
  'Notice how backlinks work: since this note mentions the welcome note, you will see it listed under backlinks at the bottom of that note, and clicking `[[Welcome to Notewell 👋]]` jumps right back.',
  '',
  'Try creating your own links between notes using `[[Note Title]]` syntax.',
  '',
  '#notewell #features',
  '',
].join('\n');

async function init(userDataDir) {
  const wasmDir = path.dirname(require.resolve('sql.js'));
  const SQL = await initSqlJs({ locateFile: (f) => path.join(wasmDir, f) });

  dbFile = path.join(userDataDir, 'notewell.sqlite');
  const fresh = !fs.existsSync(dbFile);
  db = fresh ? new SQL.Database() : new SQL.Database(fs.readFileSync(dbFile));
  db.run('PRAGMA foreign_keys = ON;');
  migrate();
  seedWelcome();
  persist();
  return dbFile;
}

// Add starter notes if they aren't present yet.
function seedWelcome() {
  const exists = get("SELECT id FROM notes WHERE title LIKE 'Welcome to Notewell%' LIMIT 1");
  if (!exists) {
    createNote(WELCOME_NOTE);
  }
  const anotherExists = get("SELECT id FROM notes WHERE title LIKE 'Another note%' LIMIT 1");
  if (!anotherExists) {
    createNote(ANOTHER_NOTE);
  }
}

function writeImage() {
  try {
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
  } catch (e) {
    console.error('persist failed:', e);
  }
}

function persist() {
  // Debounced full-image write. Safe and simple for a starter database.
  clearTimeout(persistTimer);
  persistTimer = setTimeout(writeImage, 150);
}

// Synchronous flush of any pending write. Call on app quit so the last edit
// is never lost to the debounce window.
function flush() {
  if (!db) return;
  clearTimeout(persistTimer);
  persistTimer = null;
  writeImage();
}

// ---- tiny query helpers over sql.js prepared statements ----

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function get(sql, params = []) {
  return all(sql, params)[0] || null;
}

function run(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  stmt.step();
  stmt.free();
}

function migrate() {
  db.run(`
    CREATE TABLE IF NOT EXISTS notes (
      id                 TEXT PRIMARY KEY,
      title              TEXT NOT NULL DEFAULT '',
      subtitle           TEXT NOT NULL DEFAULT '',
      text               TEXT NOT NULL DEFAULT '',
      pinned             INTEGER NOT NULL DEFAULT 0,
      archived           INTEGER NOT NULL DEFAULT 0,
      trashed            INTEGER NOT NULL DEFAULT 0,
      encrypted          INTEGER NOT NULL DEFAULT 0,
      encryption_version INTEGER NOT NULL DEFAULT 0,
      encrypted_data     BLOB,
      created_at         INTEGER NOT NULL,
      modified_at        INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tags (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT NOT NULL UNIQUE,
      parent TEXT
    );
    CREATE TABLE IF NOT EXISTS note_tags (
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (note_id, tag_id)
    );
    CREATE TABLE IF NOT EXISTS links (
      from_note TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      to_title  TEXT NOT NULL,
      PRIMARY KEY (from_note, to_title)
    );
    CREATE TABLE IF NOT EXISTS todos (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
      text    TEXT NOT NULL,
      done    INTEGER NOT NULL DEFAULT 0,
      line    INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_modified ON notes(modified_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notetags_tag   ON note_tags(tag_id);
  `);
}

// ---- derivation: pull tags / todos / links out of the Markdown text ----

function deriveTitle(text) {
  const firstLine = (text.split('\n')[0] || '').replace(/^#+\s*/, '').trim();
  return firstLine.slice(0, 200);
}

function deriveSubtitle(text) {
  const lines = text.split('\n').slice(1).map((l) => l.trim()).filter(Boolean);
  return (lines[0] || '').replace(/^#+\s*/, '').slice(0, 200);
}

function extractTags(text) {
  const withoutFences = text.replace(/```[\s\S]*?```/g, '');
  const matches = withoutFences.match(/(?:^|\s)#([A-Za-z0-9_][A-Za-z0-9_/-]*)/g) || [];
  return [...new Set(matches.map((m) => m.trim().slice(1)))];
}

function extractLinks(text) {
  const matches = text.match(/\[\[([^\]]+)\]\]/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2).trim()).filter(Boolean))];
}

function extractTodos(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    if (m) out.push({ done: m[1].toLowerCase() === 'x' ? 1 : 0, text: m[2].trim(), line: i });
  });
  return out;
}

function syncDerived(noteId, text) {
  run('DELETE FROM note_tags WHERE note_id = ?', [noteId]);
  for (const name of extractTags(text)) {
    const parent = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : null;
    run('INSERT OR IGNORE INTO tags(name, parent) VALUES (?, ?)', [name, parent]);
    const tag = get('SELECT id FROM tags WHERE name = ?', [name]);
    run('INSERT OR IGNORE INTO note_tags(note_id, tag_id) VALUES (?, ?)', [noteId, tag.id]);
  }
  run('DELETE FROM links WHERE from_note = ?', [noteId]);
  for (const to of extractLinks(text)) {
    run('INSERT OR IGNORE INTO links(from_note, to_title) VALUES (?, ?)', [noteId, to]);
  }
  run('DELETE FROM todos WHERE note_id = ?', [noteId]);
  for (const t of extractTodos(text)) {
    run('INSERT INTO todos(note_id, text, done, line) VALUES (?, ?, ?, ?)',
      [noteId, t.text, t.done, t.line]);
  }
}

// ---- public API (called over IPC) ----

function listNotes({ includeTrashed = false, trashedOnly = false, tag = null } = {}) {
  if (tag) {
    return all(`
      SELECT n.id, n.title, n.subtitle, n.pinned, n.modified_at, n.encrypted, substr(n.text, 1, 280) AS snippet
      FROM notes n
      JOIN note_tags nt ON nt.note_id = n.id
      JOIN tags t ON t.id = nt.tag_id
      WHERE t.name = ? AND n.trashed = 0
      ORDER BY n.pinned DESC, n.modified_at DESC
    `, [tag]);
  }
  const where = trashedOnly ? 'trashed = 1' : includeTrashed ? '1 = 1' : 'trashed = 0';
  return all(`
    SELECT id, title, subtitle, pinned, modified_at, encrypted, substr(text, 1, 280) AS snippet
    FROM notes WHERE ${where}
    ORDER BY pinned DESC, modified_at DESC
  `);
}

function countTrashed() {
  const row = get('SELECT COUNT(*) AS n FROM notes WHERE trashed = 1');
  return row ? row.n : 0;
}

function searchNotes(q) {
  const like = '%' + String(q).replace(/[%_\\]/g, '') + '%';
  return all(`
    SELECT id, title, subtitle, pinned, modified_at, encrypted, substr(text, 1, 280) AS snippet
    FROM notes
    WHERE trashed = 0 AND (title LIKE ? OR text LIKE ?)
    ORDER BY pinned DESC, modified_at DESC
  `, [like, like]);
}

function getNote(id) {
  return get('SELECT * FROM notes WHERE id = ?', [id]);
}

function createNote(text = '') {
  const now = Date.now();
  const id = crypto.randomUUID();
  run(`INSERT INTO notes(id, title, subtitle, text, created_at, modified_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    [id, deriveTitle(text), deriveSubtitle(text), text, now, now]);
  syncDerived(id, text);
  persist();
  return getNote(id);
}

function updateNote(id, text) {
  const now = Date.now();
  run('UPDATE notes SET text = ?, title = ?, subtitle = ?, modified_at = ? WHERE id = ?',
    [text, deriveTitle(text), deriveSubtitle(text), now, id]);
  syncDerived(id, text);
  persist();
  return getNote(id);
}

// Encryption: the renderer produces the ciphertext blob; we store it and drop
// the plaintext body. The title is kept (plaintext) as a usable list label.
function setEncrypted(id, title, blob) {
  run(`UPDATE notes SET encrypted = 1, encryption_version = 1, encrypted_data = ?,
       text = '', title = ?, subtitle = '', modified_at = ? WHERE id = ?`,
    [blob, title, Date.now(), id]);
  syncDerived(id, ''); // body is gone; clear derived tags/todos/links
  persist();
  return getNote(id);
}

// Remove encryption: the renderer has decrypted; store plaintext and clear flags.
function removeEncryption(id, text) {
  run(`UPDATE notes SET encrypted = 0, encryption_version = 0, encrypted_data = NULL,
       text = ?, title = ?, subtitle = ?, modified_at = ? WHERE id = ?`,
    [text, deriveTitle(text), deriveSubtitle(text), Date.now(), id]);
  syncDerived(id, text);
  persist();
  return getNote(id);
}

function emptyTrash() {
  run('DELETE FROM notes WHERE trashed = 1');
  persist();
}

function renameNote(id, name) {
  const n = getNote(id);
  if (!n) return null;
  const lines = n.text.split('\n');
  if (/^#{1,6}\s/.test(lines[0])) {
    const hashes = lines[0].match(/^#{1,6}/)[0];
    lines[0] = `${hashes} ${name}`;
  } else {
    lines.unshift(`# ${name}`);
  }
  return updateNote(id, lines.join('\n'));
}

function deleteNote(id) {
  // Hard delete. note_tags / links / todos cascade via ON DELETE CASCADE.
  run('DELETE FROM notes WHERE id = ?', [id]);
  persist();
}

function setFlag(id, flag, value) {
  const allowed = ['pinned', 'archived', 'trashed'];
  if (!allowed.includes(flag)) throw new Error('bad flag');
  run(`UPDATE notes SET ${flag} = ?, modified_at = ? WHERE id = ?`,
    [value ? 1 : 0, Date.now(), id]);
  persist();
  return getNote(id);
}

function listTags() {
  return all(`
    SELECT t.name, t.parent, COUNT(nt.note_id) AS count
    FROM tags t
    LEFT JOIN note_tags nt ON nt.tag_id = t.id
    LEFT JOIN notes n ON n.id = nt.note_id AND n.trashed = 0
    GROUP BY t.id
    HAVING count > 0
    ORDER BY t.name
  `);
}

function backlinks(noteId) {
  const note = getNote(noteId);
  if (!note || !note.title) return [];
  return all(`
    SELECT n.id, n.title FROM links l
    JOIN notes n ON n.id = l.from_note
    WHERE l.to_title = ? AND n.trashed = 0
  `, [note.title]);
}

module.exports = {
  init, flush, seedWelcome, listNotes, countTrashed, searchNotes, getNote, createNote, updateNote,
  renameNote, deleteNote, emptyTrash, setEncrypted, removeEncryption, setFlag, listTags, backlinks,
};
