/**
 * System tray - icon and context menu. Updates when status changes.
 * Menu: Status, Toggle Keep Active, Restart Activity Engine, Start at Login, Open Logs, Quit.
 */

const { Tray, Menu, shell, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');
const activityEngine = require('./activityEngine');
const settings = require('./settings');
const logger = require('./logger');
const licenseManager = require('./licenseManager');
const scheduledWake = require('./scheduledWake');

let tray = null;
let trayImagePath = null;
let onOpenActivation = null;

/**
 * Icona di fallback in-memory: 16x16 PNG nero (template) in base64.
 * Usata se il file non esiste o non viene caricato, così su macOS l'icona è sempre visibile.
 */
const FALLBACK_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAHklEQVQ4T2NkYGD4z0ABYBzVMKoBBgwMDP8ZqAEAHQYBAQp0s1AAAAAASUVORK5CYII=';

function getFallbackImage() {
  return nativeImage.createFromDataURL('data:image/png;base64,' + FALLBACK_ICON_BASE64);
}

/**
 * Resolve tray icon. Prova assets/trayTemplate.png, poi fallback in-memory.
 * Su macOS un'icona vuota non appare in menu bar, quindi non usiamo mai createEmpty().
 */
function getTrayImage() {
  const candidates = [
    path.join(__dirname, 'assets', 'trayTemplate.png'),
    path.join(process.cwd(), 'assets', 'trayTemplate.png'),
    path.join(__dirname, 'assets', 'trayIcon.png'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (img && !img.isEmpty()) {
        trayImagePath = p;
        return img;
      }
    }
  }
  trayImagePath = null;
  return getFallbackImage();
}

/**
 * Build Scheduled Wake submenu: presets (30m, 1h, 2h, 4h, 8h) and Cancel if active.
 */
function buildScheduledWakeSubmenu() {
  const items = [];
  const status = scheduledWake.getStatus();
  if (status.active && status.remainingMs != null) {
    items.push({
      label: `Time left: ${scheduledWake.formatRemaining(status.remainingMs)}`,
      enabled: false,
    });
    items.push({
      label: 'Cancel Scheduled Wake',
      click: () => {
        scheduledWake.cancel();
        updateTrayMenu();
      },
    });
    items.push({ type: 'separator' });
  }
  const presets = scheduledWake.getPresets();
  for (const preset of presets) {
    items.push({
      label: preset.label,
      click: () => {
        if (!licenseManager.isValid()) {
          if (onOpenActivation) onOpenActivation();
          return;
        }
        scheduledWake.start(preset.durationMs);
        updateTrayMenu();
      },
    });
  }
  return items;
}

/**
 * Build context menu with current state and settings.
 */
function buildMenu() {
  const status = activityEngine.getStatus();
  const { activityEnabled, autoStart } = settings.get();
  const statusLabel = status.state === activityEngine.STATE_ACTIVE ? 'Status: Active' : 'Status: Paused';
  const toggleLabel = activityEnabled ? 'Pause Keep Active' : 'Start Keep Active';

  return Menu.buildFromTemplate([
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    {
      label: toggleLabel,
      click: () => {
        const next = !settings.get().activityEnabled;
        if (next && !licenseManager.isValid()) {
          if (onOpenActivation) onOpenActivation();
          return;
        }
        settings.set({ activityEnabled: next });
        if (next) activityEngine.start();
        else activityEngine.stop();
        updateTrayMenu();
      },
    },
    {
      label: 'Restart Activity Engine',
      click: () => {
        if (!licenseManager.isValid()) {
          if (onOpenActivation) onOpenActivation();
          return;
        }
        if (settings.get().activityEnabled) {
          activityEngine.restart();
          updateTrayMenu();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Scheduled Wake',
      submenu: buildScheduledWakeSubmenu(),
    },
    { type: 'separator' },
    {
      label: 'Start at Login',
      type: 'checkbox',
      checked: autoStart,
      click: (menuItem) => {
        settings.set({ autoStart: menuItem.checked });
        applyLoginItemSettings();
      },
    },
    {
      label: 'Open Logs',
      click: () => {
        const logPath = logger.getLogPath();
        const dir = path.dirname(logPath);
        if (fs.existsSync(dir)) {
          shell.openPath(dir).catch(() => shell.showItemInFolder(logPath));
        }
      },
    },
    ...(onOpenActivation ? [{
      label: 'Attiva licenza',
      click: () => onOpenActivation(),
    }] : []),
    { type: 'separator' },
    { label: 'Quit', role: 'quit' },
  ]);
}

/**
 * Apply Start at Login via app.setLoginItemSettings (called from main with app reference).
 */
let appRef = null;
function setAppRef(app) {
  appRef = app;
}

function applyLoginItemSettings() {
  if (!appRef) return;
  const { autoStart } = settings.get();
  try {
    if (process.platform === 'darwin') {
      appRef.setLoginItemSettings({
        openAtLogin: autoStart,
        openAsHidden: true,
      });
    } else if (process.platform === 'win32') {
      appRef.setLoginItemSettings({
        openAtLogin: autoStart,
      });
    }
  } catch (err) {
    if (typeof global.logger !== 'undefined') {
      global.logger.error('LoginItem', err.message);
    }
  }
}

/**
 * Refresh tray menu (e.g. after status change).
 */
function updateTrayMenu() {
  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(buildMenu());
  }
}

/**
 * Create tray icon and menu. Call once when app is ready.
 * @param {Electron.App} app - For setLoginItemSettings.
 * @param {{ onOpenActivation?: () => void }} [options] - Optional callback to open activation window.
 */
function create(app, options = {}) {
  if (tray) return;
  appRef = app;
  onOpenActivation = options.onOpenActivation || null;
  let icon = getTrayImage();
  if (!icon || icon.isEmpty()) icon = getFallbackImage();
  // Su macOS: se usiamo il fallback (pallino nero), template=true; se usiamo il logo da file, lasciamo a colori
  if (process.platform === 'darwin' && icon.setTemplateImage && trayImagePath === null) {
    icon.setTemplateImage(true);
  }
  tray = new Tray(icon);
  tray.setToolTip('NoAway');
  tray.setContextMenu(buildMenu());

  activityEngine.setOnStatusChange(() => {
    updateTrayMenu();
  });
}

/**
 * Destroy tray (e.g. before quit). Safe: checks existence and isDestroyed before calling destroy.
 */
function destroy() {
  if (!tray) return;
  if (!tray.isDestroyed()) {
    tray.destroy();
  }
  tray = null;
}

module.exports = {
  create,
  destroy,
  updateTrayMenu,
  applyLoginItemSettings,
  setAppRef,
};
