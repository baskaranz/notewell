'use strict';

// Renderer entry. Bundled by esbuild into renderer.bundle.js.
// Two view modes: "live" (inline live-preview editor) and "split" (raw Markdown
// source on the left, rendered preview on the right).

import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, highlightActiveLine, placeholder } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { marked } from 'marked';
import { liveMarkdown } from './markdown-live.js';
import { THEMES, applyTheme, currentThemeId, initTheme } from './themes.js';
import { encryptText, decryptText } from './crypto.js';
import { askPassphrase, confirmModal } from './modal.js';

const api = window.api;

let currentId = null;
let saveTimer = null;
let editor = null;
let mode = 'live';          // 'live' | 'split'
let showingTrash = false;
let activeTag = null;
let searchQuery = '';
let currentEncrypted = false;
const unlocked = Object.create(null); // noteId -> passphrase, session memory only

function titleOf(text) {
  return (text.split('\n')[0] || '').replace(/^#+\s*/, '').trim().slice(0, 200);
}

// Compartments let us swap styling + font without rebuilding the editor.
const styleC = new Compartment();
const fontC = new Compartment();

const serifTheme = EditorView.theme({
  '.cm-content': {
    fontFamily: "'Charter', 'Iowan Old Style', 'Palatino', Georgia, serif",
    lineHeight: '1.7',
  },
});
const monoTheme = EditorView.theme({
  '.cm-content': {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    lineHeight: '1.6',
    fontSize: '14px',
  },
});

function liveConfig() { return [styleC.of(liveMarkdown), fontC.of(serifTheme)]; }

function initEditor() {
  const state = EditorState.create({
    doc: '',
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown({ base: markdownLanguage }),
      ...liveConfig(),
      placeholder('Write something…  (# for a title, #tag, [[link]])'),
      highlightActiveLine(),
      EditorView.lineWrapping,
      EditorView.updateListener.of((v) => {
        if (v.docChanged) {
          scheduleSave();
          if (mode === 'split') renderPreview();
        }
      }),
      EditorView.domEventHandlers({
        click(event, view) {
          const target = event.target;
          const tagEl = target.closest('.nw-tag');
          if (tagEl) {
            const tag = tagEl.textContent.trim().replace(/^#/, '');
            setSource('tag:' + tag);
            return true;
          }
          const wikiEl = target.closest('.nw-wikilink');
          if (wikiEl) {
            const title = wikiEl.textContent.trim().replace(/^\[\[/, '').replace(/\]\]$/, '');
            openWikiLink(title);
            return true;
          }
          const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
          if (pos != null) {
            const line = view.state.doc.lineAt(pos);
            const m = line.text.match(/^(\s*[-*]\s+)\[([ xX])\]/);
            if (m) {
              const checkStart = line.from + m[1].length;
              const checkEnd = checkStart + 3;
              if (pos >= checkStart && pos <= checkEnd) {
                const isDone = m[2].toLowerCase() === 'x';
                view.dispatch({
                  changes: { from: checkStart + 1, to: checkStart + 2, insert: isDone ? ' ' : 'x' },
                });
                return true;
              }
            }
          }
          return false;
        },
      }),
      EditorView.theme({
        '&': { height: '100%', fontSize: '17px', color: 'var(--text)', backgroundColor: 'transparent' },
        '.cm-scroller': { backgroundColor: 'transparent' },
        '.cm-content': { padding: '40px 56px 120px', maxWidth: '740px', margin: '0 auto', caretColor: 'var(--accent)' },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
        '.cm-line': { padding: '0' },
        '.cm-focused': { outline: 'none' },
      }),
    ],
  });
  editor = new EditorView({ state, parent: document.getElementById('editor-host') });
}

async function openWikiLink(rawTitle) {
  const targetTitle = (rawTitle || '').trim();
  if (!targetTitle) return;
  await save();
  const notes = await api.listNotes({ includeTrashed: false });
  const found = notes.find((n) => (n.title || '').toLowerCase() === targetTitle.toLowerCase());
  if (found) {
    await openNote(found.id);
  } else {
    const note = await api.createNote(`# ${targetTitle}\n\n`);
    await refreshLists();
    await openNote(note.id);
  }
}

// ---- view mode -----------------------------------------------------------

function setMode(next) {
  mode = next;
  const split = next === 'split';
  editor.dispatch({
    effects: [
      styleC.reconfigure(split ? syntaxHighlighting(defaultHighlightStyle) : liveMarkdown),
      fontC.reconfigure(split ? monoTheme : serifTheme),
    ],
  });
  document.getElementById('preview').hidden = !split;
  document.getElementById('panes').classList.toggle('split', split);
  document.querySelectorAll('#mode-switch button').forEach((b) =>
    b.classList.toggle('active', b.dataset.mode === next));
  if (split) renderPreview();
  editor.focus();
}

function renderPreview() {
  const el = document.getElementById('preview');
  // CSP (script-src 'self') blocks any inline scripts/handlers in rendered HTML.
  let rawHtml = marked.parse(editor.state.doc.toString(), { breaks: true });
  rawHtml = rawHtml.replace(/(^|\s)#([A-Za-z0-9_][A-Za-z0-9_/-]*)/g, '$1<span class="nw-tag">#$2</span>');
  rawHtml = rawHtml.replace(/\[\[([^\]\n]+)\]\]/g, '<span class="nw-wikilink">[[$1]]</span>');
  el.innerHTML = rawHtml;
}

// ---- save / open ---------------------------------------------------------

function scheduleSave() {
  if (!currentId) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 400);
}

async function save() {
  if (!currentId) return;
  try {
    const text = editor.state.doc.toString();
    let note;
    if (currentEncrypted) {
      const pass = unlocked[currentId];
      if (!pass) return; // note is locked and not unlocked this session
      const blob = await encryptText(text, pass);
      note = await api.setEncrypted(currentId, titleOf(text), blob);
    } else {
      note = await api.updateNote(currentId, text);
    }
    renderMeta(note);
    await refreshLists();
  } catch (e) {
    console.error('[save failed]', (e && (e.stack || e.message)) || e);
  }
}

function setDoc(text) {
  editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: text } });
}

async function unlockFlow(note) {
  if (unlocked[note.id]) {
    try { return await decryptText(note.encrypted_data, unlocked[note.id]); }
    catch { delete unlocked[note.id]; }
  }
  for (;;) {
    const pass = await askPassphrase({
      title: 'Unlock note', message: 'Enter the passphrase to read this note.', okLabel: 'Unlock',
    });
    if (pass === null) return null;
    try {
      const plain = await decryptText(note.encrypted_data, pass);
      unlocked[note.id] = pass;
      return plain;
    } catch {
      const again = await confirmModal({
        title: 'Wrong passphrase', message: 'That passphrase did not work.', okLabel: 'Try again',
      });
      if (!again) return null;
    }
  }
}

// Gate destructive actions on locked notes: must know the passphrase.
async function ensureUnlocked(note) {
  if (!note || !note.encrypted) return true;
  if (unlocked[note.id]) return true;
  return (await unlockFlow(note)) !== null;
}

async function openNote(id) {
  await save();
  const note = await api.getNote(id);
  if (!note) return;

  let text = note.text;
  if (note.encrypted) {
    const plain = await unlockFlow(note);
    if (plain === null) { currentId = null; currentEncrypted = false; showEmpty(true); updateLockButton(); return; }
    text = plain;
  }

  currentId = id;
  currentEncrypted = !!note.encrypted;
  showEmpty(false);
  setDoc(text);
  editor.dispatch({ selection: { anchor: editor.state.doc.length } });
  renderMeta(note);
  updateLockButton();
  highlightSelected();
  if (mode === 'split') renderPreview();
  editor.focus();
}

async function newNote() {
  try {
    await save();
    // a new note should always be visible: leave any tag filter / trash view
    activeTag = null;
    showingTrash = false;
    const note = await api.createNote('');
    await refreshLists();
    await openNote(note.id);
  } catch (e) {
    console.error('[newNote failed]', (e && (e.stack || e.message)) || e);
  }
}

// ---- sidebar lists -------------------------------------------------------

async function refreshLists() {
  const notesP = searchQuery
    ? api.searchNotes(searchQuery)
    : api.listNotes(showingTrash ? { trashedOnly: true } : { tag: activeTag });
  const [notes, tags, trashCount] = await Promise.all([notesP, api.listTags(), api.trashCount()]);
  renderNoteList(notes);
  renderNav(tags, trashCount);
  document.getElementById('list-title').textContent =
    searchQuery ? `“${searchQuery}”` : showingTrash ? 'Trash' : activeTag ? `#${activeTag}` : 'All Notes';
}

function previewText(n) {
  if (n.encrypted) return '🔒 Encrypted note';
  const s = (n.snippet || '').replace(/\r/g, '');
  const nl = s.indexOf('\n');
  const rest = nl >= 0 ? s.slice(nl + 1) : (n.title ? '' : s);
  const body = rest
    .split('\n')
    .map((l) => l.replace(/^\s*([#>*\-+]|\d+\.)\s*/, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return body || 'No additional text';
}

function renderNoteList(notes) {
  const ul = document.getElementById('note-list');
  ul.innerHTML = '';
  if (!notes.length) {
    const li = document.createElement('li');
    li.className = 'list-empty';
    li.textContent = searchQuery ? 'No matches' : showingTrash ? 'Trash is empty' : 'No notes yet';
    ul.appendChild(li);
    return;
  }
  for (const n of notes) {
    const li = document.createElement('li');
    li.dataset.id = n.id;
    li.className = 'note-item' + (n.id === currentId ? ' selected' : '') + (n.pinned ? ' pinned' : '');

    const main = document.createElement('div');
    main.className = 'ni-body';
    main.innerHTML =
      `<div class="ni-title">${escapeHtml(n.title || 'Untitled')}</div>` +
      `<div class="ni-preview">${escapeHtml(previewText(n))}</div>` +
      `<div class="ni-foot">` +
        (n.pinned ? `<span class="ni-pin">${icon('pin', 12)}</span>` : '') +
        `<span class="ni-date">${noteDate(n.modified_at)}</span>` +
      `</div>`;
    main.addEventListener('click', () => (showingTrash ? null : openNote(n.id)));
    main.addEventListener('dblclick', (e) => { if (!showingTrash) startRename(e, n); });

    const actions = document.createElement('div');
    actions.className = 'note-actions';
    if (showingTrash) {
      actions.appendChild(iconBtn('restore', 'Restore', async () => {
        await api.setFlag(n.id, 'trashed', false);
        await refreshLists();
      }));
      actions.appendChild(iconBtn('close', 'Delete forever', async () => {
        const full = await api.getNote(n.id);
        if (!(await ensureUnlocked(full))) return;
        const ok = await confirmModal({
          title: 'Delete note',
          message: `Permanently delete “${n.title || 'Untitled'}”? This cannot be undone.`,
          okLabel: 'Delete',
        });
        if (!ok) return;
        await api.deleteNote(n.id);
        if (currentId === n.id) { currentId = null; currentEncrypted = false; showEmpty(true); updateLockButton(); }
        await refreshLists();
      }));
    } else {
      const pinBtn = iconBtn('pin', n.pinned ? 'Unpin' : 'Pin', async () => {
        await api.setFlag(n.id, 'pinned', !n.pinned);
        await refreshLists();
      });
      if (n.pinned) pinBtn.classList.add('on');
      actions.appendChild(pinBtn);
      actions.appendChild(iconBtn('pencil', 'Rename', (e) => startRename(e, n, main)));
      actions.appendChild(iconBtn('trash', 'Move to Trash', async () => {
        const full = await api.getNote(n.id);
        if (!(await ensureUnlocked(full))) return;
        await api.setFlag(n.id, 'trashed', true);
        if (currentId === n.id) currentId = null;
        await refreshLists();
        await openFirstOrNew();
      }));
    }

    li.appendChild(main);
    li.appendChild(actions);
    ul.appendChild(li);
  }
}

// Monochrome SF-style line icons (stroke = currentColor).
const ICONS = {
  compose: '<path d="M12 4.5H6.5A2.5 2.5 0 0 0 4 7v10.5A2.5 2.5 0 0 0 6.5 20H17a2.5 2.5 0 0 0 2.5-2.5V13"/><path d="M18 3.6a1.9 1.9 0 0 1 2.7 2.7L12.2 14.8l-3.4.9.9-3.4z"/>',
  trash: '<path d="M4.5 7h15"/><path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7"/><path d="M6.5 7l.9 11.4A1.6 1.6 0 0 0 9 20h6a1.6 1.6 0 0 0 1.6-1.6L17.5 7"/>',
  appearance: '<circle cx="12" cy="12" r="8.25"/><path d="M12 3.75a8.25 8.25 0 0 0 0 16.5z" fill="currentColor" stroke="none"/>',
  pencil: '<path d="M5 19l1-4L16 5a1.8 1.8 0 0 1 2.6 2.6L8.6 17.6z"/><path d="M14.5 6.5l3 3"/>',
  pin: '<path d="M14.5 3.8l5.7 5.7-1.8 1-3.1 3.1-.5 4.1-5-5-5 5 5-5-5-5 4.1-.5 3.1-3.1 1-1.8z"/>',
  restore: '<path d="M4.5 10a8 8 0 1 1-1.3 5.4"/><path d="M4 4.5V10h5.5"/>',
  close: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20"/>',
  notes: '<rect x="5" y="3.5" width="14" height="17" rx="2.5"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4.5"/>',
  tag: '<path d="M4 12.8V5.4A1.4 1.4 0 0 1 5.4 4h7.4a1.4 1.4 0 0 1 1 .4l6.4 6.4a1.4 1.4 0 0 1 0 2l-7 7a1.4 1.4 0 0 1-2 0l-6.4-6.4a1.4 1.4 0 0 1-.4-1z"/><circle cx="8.2" cy="8.2" r="1.3" fill="currentColor" stroke="none"/>',
  lock: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  lockOpen: '<rect x="5" y="10.5" width="14" height="9.5" rx="2.2"/><path d="M8 10.5V7.5a4 4 0 0 1 7.7-1.5"/>',
};

function icon(name, size = 16) {
  return `<svg class="ic" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none"` +
    ` stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"` +
    ` aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

function iconBtn(name, title, onClick) {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.innerHTML = icon(name);
  b.title = title;
  b.setAttribute('aria-label', title);
  b.addEventListener('click', (e) => { e.stopPropagation(); onClick(e); });
  return b;
}

function startRename(e, note, mainEl) {
  e.stopPropagation();
  const host = (mainEl || e.currentTarget.closest('.note-item').querySelector('.ni-body'));
  const titleEl = host.querySelector('.ni-title');
  const input = document.createElement('input');
  input.className = 'rename-input';
  input.value = note.title || '';
  titleEl.replaceWith(input);
  input.focus();
  input.select();
  const commit = async () => {
    const name = input.value.trim();
    if (name && name !== note.title) await api.renameNote(note.id, name);
    await refreshLists();
    if (currentId === note.id) { const fresh = await api.getNote(note.id); setDoc(fresh.text); }
  };
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
    if (ev.key === 'Escape') { input.value = note.title || ''; input.blur(); }
  });
  input.addEventListener('blur', commit, { once: true });
}

function sourceKey() {
  return showingTrash ? 'trash' : activeTag ? 'tag:' + activeTag : 'all';
}

async function setSource(key) {
  showingTrash = key === 'trash';
  activeTag = key.startsWith('tag:') ? key.slice(4) : null;
  searchQuery = '';
  const s = document.getElementById('search');
  if (s) s.value = '';
  document.getElementById('search-wrap').hidden = true;
  await refreshLists();
}

function navItem(key, iconName, label, count) {
  const el = document.createElement('div');
  el.className = 'nav-item' + (key === sourceKey() ? ' active' : '');
  el.innerHTML = icon(iconName, 16) +
    `<span class="nav-label">${escapeHtml(label)}</span>` +
    (count ? `<span class="nav-count">${count}</span>` : '');
  el.addEventListener('click', () => setSource(key));
  return el;
}

function renderNav(tags, trashCount) {
  const nav = document.getElementById('nav-list');
  nav.innerHTML = '';
  nav.appendChild(navItem('all', 'notes', 'All Notes'));
  nav.appendChild(navItem('trash', 'trash', 'Trash', trashCount));
  if (tags.length) {
    const h = document.createElement('div');
    h.className = 'nav-section';
    h.textContent = 'Tags';
    nav.appendChild(h);
    for (const t of tags) {
      const item = navItem('tag:' + t.name, 'tag', t.name, t.count);
      const depth = (t.name.match(/\//g) || []).length;
      if (depth) item.style.paddingLeft = `${12 + depth * 14}px`;
      nav.appendChild(item);
    }
  }
}

function noteDate(ms) {
  const d = new Date(ms), now = new Date();
  const opts = d.getFullYear() === now.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return d.toLocaleDateString(undefined, opts);
}

function toggleSearch(forceOpen) {
  const wrap = document.getElementById('search-wrap');
  const open = forceOpen !== undefined ? forceOpen : wrap.hidden;
  wrap.hidden = !open;
  if (open) document.getElementById('search').focus();
  else {
    document.getElementById('search').value = '';
    if (searchQuery) { searchQuery = ''; refreshLists(); }
  }
}

// ---- theme picker --------------------------------------------------------

function buildThemePicker() {
  const pop = document.getElementById('theme-popover');
  pop.innerHTML = '';
  const active = currentThemeId();
  for (const t of THEMES) {
    const b = document.createElement('button');
    b.className = 'theme-swatch' + (t.id === active ? ' active' : '');
    b.innerHTML =
      `<span class="swatch-chip" style="background:${t.tokens.bg};border-color:${t.tokens.border}">` +
      `<span class="swatch-dot" style="background:${t.tokens.accent}"></span>` +
      `<span class="swatch-bar" style="background:${t.tokens.text}"></span></span>` +
      `<span class="swatch-name">${t.name}</span>`;
    b.addEventListener('click', () => {
      applyTheme(t.id);
      buildThemePicker();
      pop.hidden = true;
    });
    pop.appendChild(b);
  }
}

function toggleThemePicker() {
  const pop = document.getElementById('theme-popover');
  if (pop.hidden) buildThemePicker();
  pop.hidden = !pop.hidden;
}

function highlightSelected() {
  document.querySelectorAll('.note-item').forEach((li) =>
    li.classList.toggle('selected', li.dataset.id === currentId));
}

function showEmpty(on) {
  document.getElementById('empty-state').hidden = !on;
  document.getElementById('editor-host').style.display = on ? 'none' : '';
  if (on) {
    document.getElementById('preview').hidden = true;
    document.getElementById('title-crumb').textContent = '';
    document.getElementById('meta-bar').textContent = '';
  } else if (mode === 'split') {
    document.getElementById('preview').hidden = false;
  }
}

async function renderMeta(note) {
  const bar = document.getElementById('meta-bar');
  const crumb = document.getElementById('title-crumb');
  if (!note) { bar.textContent = ''; crumb.textContent = ''; return; }
  crumb.textContent = (currentEncrypted ? '🔒 ' : '') + (note.title || 'Untitled');
  const text = editor ? editor.state.doc.toString() : (note.text || '');
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const when = new Date(note.modified_at).toLocaleString(undefined,
    { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  let html = `<span class="meta-words">${words} ${words === 1 ? 'word' : 'words'} · edited ${when}`
    + (currentEncrypted ? ' · encrypted' : '') + `</span>`;

  if (!currentEncrypted) {
    try {
      const bl = await api.backlinks(note.id);
      if (bl && bl.length > 0) {
        html += `<span class="meta-sep">·</span><span class="meta-backlinks"><span class="meta-bl-label">Backlinks:</span> ` +
          bl.map((b) => `<button class="backlink-pill" data-id="${b.id}" title="Open note">${escapeHtml(b.title || 'Untitled')}</button>`).join(' ') +
          `</span>`;
      }
    } catch { /* ignore */ }
  }
  bar.innerHTML = html;
  bar.querySelectorAll('.backlink-pill').forEach((btn) => {
    btn.addEventListener('click', () => openNote(btn.dataset.id));
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function openFirstOrNew() {
  const notes = await api.listNotes({ tag: activeTag });
  if (notes.length) await openNote(notes[0].id);
  else await newNote();
}

async function exportCurrent() {
  if (!currentId) return;
  const text = editor.state.doc.toString();
  await api.exportMarkdown(titleOf(text) || 'note', text);
}

async function trashCurrent() {
  if (!currentId) return;
  const id = currentId;
  currentId = null;
  await api.setFlag(id, 'trashed', true);
  await refreshLists();
  await openFirstOrNew();
}

function updateLockButton() {
  const b = document.getElementById('lock-btn');
  if (!currentId) { b.hidden = true; return; }
  b.hidden = false;
  b.innerHTML = icon(currentEncrypted ? 'lock' : 'lockOpen', 17);
  b.classList.toggle('on', currentEncrypted);
  b.title = currentEncrypted ? 'Remove encryption (⌘L)' : 'Lock note (⌘L)';
}

async function toggleLock() {
  if (!currentId) return;
  if (!currentEncrypted) {
    const pass = await askPassphrase({
      title: 'Lock note',
      message: 'Set a passphrase. You need it to read this note — there is no recovery if you forget it.',
      okLabel: 'Lock', confirm: true,
    });
    if (!pass) return;
    const text = editor.state.doc.toString();
    unlocked[currentId] = pass;
    currentEncrypted = true;
    const note = await api.setEncrypted(currentId, titleOf(text), await encryptText(text, pass));
    renderMeta(note); updateLockButton(); await refreshLists();
  } else {
    const ok = await confirmModal({
      title: 'Remove encryption', message: 'This note will be stored unencrypted.', okLabel: 'Remove',
    });
    if (!ok) return;
    const text = editor.state.doc.toString();
    const note = await api.removeEncryption(currentId, text);
    currentEncrypted = false; delete unlocked[currentId];
    renderMeta(note); updateLockButton(); await refreshLists();
  }
}

async function emptyTrashFlow() {
  const ok = await confirmModal({
    title: 'Empty Trash',
    message: 'Permanently delete all notes in Trash? This cannot be undone.', okLabel: 'Empty Trash',
  });
  if (!ok) return;
  await api.emptyTrash();
  if (showingTrash) { currentId = null; currentEncrypted = false; showEmpty(true); updateLockButton(); }
  await refreshLists();
}

function handleMenu(action) {
  switch (action) {
    case 'new': newNote(); break;
    case 'export': exportCurrent(); break;
    case 'trash': trashCurrent(); break;
    case 'toggleLock': toggleLock(); break;
    case 'emptyTrash': emptyTrashFlow(); break;
    case 'mode:live': setMode('live'); break;
    case 'mode:split': setMode('split'); break;
    case 'mode:toggle': setMode(mode === 'live' ? 'split' : 'live'); break;
    case 'search': toggleSearch(true); break;
    case 'preferences': toggleThemePicker(); break;
    default: break;
  }
}

// ---- boot ----------------------------------------------------------------

async function boot() {
  initTheme();
  initEditor();
  document.getElementById('new-note').innerHTML = icon('compose', 17);
  document.getElementById('theme-btn').innerHTML = icon('appearance', 17);
  document.getElementById('search-btn').innerHTML = icon('search', 17);
  document.getElementById('new-note').addEventListener('click', newNote);
  document.getElementById('lock-btn').addEventListener('click', toggleLock);
  document.getElementById('search-btn').addEventListener('click', () => toggleSearch());
  document.getElementById('theme-btn').addEventListener('click', (e) => { e.stopPropagation(); toggleThemePicker(); });
  document.addEventListener('click', (e) => {
    const pop = document.getElementById('theme-popover');
    if (!pop.hidden && !pop.contains(e.target) && e.target.closest('#theme-btn') === null) pop.hidden = true;
  });
  document.querySelectorAll('#mode-switch button').forEach((b) =>
    b.addEventListener('click', () => setMode(b.dataset.mode)));

  document.getElementById('preview').addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a) {
      const href = a.getAttribute('href');
      if (href && (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:'))) {
        e.preventDefault();
        if (api.openExternal) api.openExternal(href);
        return;
      }
    }
    const tagEl = e.target.closest('.nw-tag');
    if (tagEl) {
      const tag = tagEl.textContent.trim().replace(/^#/, '');
      setSource('tag:' + tag);
      return;
    }
    const wikiEl = e.target.closest('.nw-wikilink');
    if (wikiEl) {
      const title = wikiEl.textContent.trim().replace(/^\[\[/, '').replace(/\]\]$/, '');
      openWikiLink(title);
      return;
    }
  });

  // search (debounced)
  const searchEl = document.getElementById('search');
  let searchT;
  searchEl.addEventListener('input', () => {
    clearTimeout(searchT);
    searchT = setTimeout(async () => { searchQuery = searchEl.value.trim(); await refreshLists(); }, 150);
  });
  searchEl.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); toggleSearch(false); searchEl.blur(); }
  });

  // menu-bar actions
  if (api.onMenu) api.onMenu(handleMenu);

  await refreshLists();
  await openFirstOrNew();
}

window.addEventListener('error', (e) =>
  console.error('[uncaught]', e.message, 'at', `${e.filename}:${e.lineno}:${e.colno}`));
window.addEventListener('unhandledrejection', (e) =>
  console.error('[unhandledrejection]', (e.reason && (e.reason.stack || e.reason.message)) || e.reason));

boot().catch((e) => console.error('[boot failed]', (e && (e.stack || e.message)) || e));
