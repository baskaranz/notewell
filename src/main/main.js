'use strict';

const { app, BrowserWindow, ipcMain, Menu, dialog, nativeImage, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const db = require('./db');

let win;
const ICON_PNG = path.join(__dirname, '..', '..', 'build', 'icon.png');

// ---- window-state persistence -------------------------------------------

function stateFile() { return path.join(app.getPath('userData'), 'window-state.json'); }

function loadState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return null; }
}

function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    const b = win.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch { /* ignore */ }
}

function createWindow() {
  const s = loadState();
  win = new BrowserWindow({
    width: (s && s.width) || 1100,
    height: (s && s.height) || 740,
    x: s && s.x,
    y: s && s.y,
    minWidth: 840,
    minHeight: 480,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#00000000',
    vibrancy: 'sidebar',              // translucent frosted material (macOS)
    visualEffectState: 'active',
    icon: fs.existsSync(ICON_PNG) ? ICON_PNG : undefined,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.on('console-message', (_e, level, msg) => {
    console.log('[RENDERER]', msg);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) {
      event.preventDefault();
      if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:')) {
        shell.openExternal(url);
      }
    }
  });
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
  for (const ev of ['resize', 'move', 'close']) win.on(ev, saveState);
}

// ask the renderer to run a UI action (menu → renderer)
function tell(action) { if (win) win.webContents.send('menu', action); }

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{
      label: 'Notewell',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: 'Preferences…', accelerator: 'Cmd+,', click: () => tell('preferences') },
        { type: 'separator' },
        { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' },
        { type: 'separator' }, { role: 'quit' },
      ],
    }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Note', accelerator: 'CmdOrCtrl+N', click: () => tell('new') },
        { label: 'Export as Markdown…', accelerator: 'CmdOrCtrl+Shift+E', click: () => tell('export') },
        { type: 'separator' },
        { label: 'Move to Trash', accelerator: 'CmdOrCtrl+Backspace', click: () => tell('trash') },
        { label: 'Empty Trash…', click: () => tell('emptyTrash') },
        ...(isMac ? [] : [{ role: 'quit' }]),
      ],
    },
    {
      label: 'Note',
      submenu: [
        { label: 'Lock / Unlock Note', accelerator: 'CmdOrCtrl+L', click: () => tell('toggleLock') },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { label: 'Live Mode', accelerator: 'CmdOrCtrl+1', click: () => tell('mode:live') },
        { label: 'Markdown Mode', accelerator: 'CmdOrCtrl+2', click: () => tell('mode:split') },
        { label: 'Toggle Mode', accelerator: 'CmdOrCtrl+\\', click: () => tell('mode:toggle') },
        { type: 'separator' },
        { label: 'Find in Notes', accelerator: 'CmdOrCtrl+F', click: () => tell('search') },
        { type: 'separator' },
        { role: 'reload' }, { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
        { type: 'separator' }, { role: 'togglefullscreen' },
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [{ label: 'Notewell on the web', click: () => shell.openExternal('https://example.com') }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---- lifecycle -----------------------------------------------------------

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
  });

  app.whenReady().then(async () => {
    await db.init(app.getPath('userData'));
    if (process.platform === 'darwin' && app.dock && fs.existsSync(ICON_PNG)) {
      app.dock.setIcon(nativeImage.createFromPath(ICON_PNG));
    }
    app.setAboutPanelOptions({
      applicationName: 'Notewell',
      applicationVersion: app.getVersion(),
      credits: 'A local-first Markdown notes app.',
      iconPath: fs.existsSync(ICON_PNG) ? ICON_PNG : undefined,
    });
    registerIpc();
    buildMenu();
    createWindow();
    if (process.argv.includes('--shot')) {
      win.webContents.once('did-finish-load', async () => {
        if (process.argv.includes('--scroll-table')) {
          await new Promise((r) => setTimeout(r, 600));
          await win.webContents.executeJavaScript('const h = Array.from(document.querySelectorAll(".cm-line")).find(el => el.textContent.includes("Tables")); if (h) h.scrollIntoView({ block: "start" }); else { const scroller = document.querySelector(".cm-scroller"); if (scroller) scroller.scrollTop = 1200; }', true);
          await new Promise((r) => setTimeout(r, 400));
        }
        if (process.argv.includes('--click-table')) {
          await win.webContents.executeJavaScript('const t = document.querySelector(".nw-live-table-wrap"); if (t) t.click();', true);
          await new Promise((r) => setTimeout(r, 400));
        }
        if (process.argv.includes('--split')) {
          await win.webContents.executeJavaScript('document.querySelector("[data-mode=split]").click()', true);
          await new Promise((r) => setTimeout(r, 400));
        }
        fs.writeFileSync('/tmp/nw_shot.png', (await win.webContents.capturePage()).toPNG());
        console.log('SHOT done'); setTimeout(() => app.quit(), 150);
      });
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  saveState();
  db.flush(); // synchronous final write, beats the debounce window
});

// ---- IPC -----------------------------------------------------------------

function registerIpc() {
  const handlers = {
    'notes:list': (_e, opts) => db.listNotes(opts || {}),
    'notes:search': (_e, q) => db.searchNotes(q),
    'notes:get': (_e, id) => db.getNote(id),
    'notes:create': (_e, text) => db.createNote(text || ''),
    'notes:update': (_e, { id, text }) => db.updateNote(id, text),
    'notes:rename': (_e, { id, name }) => db.renameNote(id, name),
    'notes:delete': (_e, id) => db.deleteNote(id),
    'notes:flag': (_e, { id, flag, value }) => db.setFlag(id, flag, value),
    'notes:trashCount': () => db.countTrashed(),
    'notes:emptyTrash': () => db.emptyTrash(),
    'note:setEncrypted': (_e, { id, title, blob }) => db.setEncrypted(id, title, blob),
    'note:removeEncryption': (_e, { id, text }) => db.removeEncryption(id, text),
    'tags:list': () => db.listTags(),
    'notes:backlinks': (_e, id) => db.backlinks(id),
    'note:exportMarkdown': async (_e, { name, text }) => {
      const safe = (name || 'note').replace(/[^\w.\- ]+/g, '_').slice(0, 80) || 'note';
      const { canceled, filePath } = await dialog.showSaveDialog(win, {
        title: 'Export as Markdown',
        defaultPath: path.join(app.getPath('documents'), `${safe}.md`),
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (canceled || !filePath) return { ok: false };
      fs.writeFileSync(filePath, text ?? '', 'utf8');
      return { ok: true, filePath };
    },
    'shell:openExternal': (_e, url) => shell.openExternal(url),
  };
  for (const [channel, fn] of Object.entries(handlers)) ipcMain.handle(channel, fn);
}
