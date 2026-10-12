'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The only bridge between renderer and main.
contextBridge.exposeInMainWorld('api', {
  listNotes: (opts) => ipcRenderer.invoke('notes:list', opts),
  searchNotes: (q) => ipcRenderer.invoke('notes:search', q),
  getNote: (id) => ipcRenderer.invoke('notes:get', id),
  createNote: (text) => ipcRenderer.invoke('notes:create', text),
  updateNote: (id, text) => ipcRenderer.invoke('notes:update', { id, text }),
  renameNote: (id, name) => ipcRenderer.invoke('notes:rename', { id, name }),
  deleteNote: (id) => ipcRenderer.invoke('notes:delete', id),
  setFlag: (id, flag, value) => ipcRenderer.invoke('notes:flag', { id, flag, value }),
  trashCount: () => ipcRenderer.invoke('notes:trashCount'),
  emptyTrash: () => ipcRenderer.invoke('notes:emptyTrash'),
  setEncrypted: (id, title, blob) => ipcRenderer.invoke('note:setEncrypted', { id, title, blob }),
  removeEncryption: (id, text) => ipcRenderer.invoke('note:removeEncryption', { id, text }),
  listTags: () => ipcRenderer.invoke('tags:list'),
  backlinks: (id) => ipcRenderer.invoke('notes:backlinks', id),
  exportMarkdown: (name, text) => ipcRenderer.invoke('note:exportMarkdown', { name, text }),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  // menu → renderer actions
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
});
