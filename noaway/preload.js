/**
 * Preload script - used if a hidden or settings window is added later.
 * Exposes no Node/Electron APIs to renderer; app is tray-only for now.
 */

const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('noaway', {
  // Placeholder for future renderer API (e.g. settings window)
  version: '1.0.0',
});
