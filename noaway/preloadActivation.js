/**
 * Preload script for activation window. Exposes only license activation IPC
 * via contextBridge. Used when contextIsolation: true and nodeIntegration: false.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('noaway', {
  activate: (payload) => ipcRenderer.invoke('license:activate', payload),
  sendActivated: () => ipcRenderer.send('activation-window:activated'),
});
