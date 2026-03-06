/**
 * NoAway - Main process.
 * Single instance, tray-only. License required; activation window if missing/invalid.
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

let logger = null;
let settings = null;
let tray = null;
let activityEngine = null;
let scheduledWake = null;
let licenseManager = null;
let activationWindow = null;
let scheduledWakeMenuInterval = null;

/**
 * Ensure single instance. Second instance focuses the app (no window to show, but tray exists).
 */
function acquireSingleInstanceLock() {
  const gotLock = app.requestSingleInstanceLock();
  if (!gotLock) {
    app.quit();
    return false;
  }
  app.on('second-instance', () => {
    if (activationWindow && !activationWindow.isDestroyed()) activationWindow.focus();
  });
  return true;
}

function openActivationWindow() {
  if (activationWindow && !activationWindow.isDestroyed()) {
    activationWindow.focus();
    return;
  }
  activationWindow = new BrowserWindow({
    width: 420,
    height: 380,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preloadActivation.js'),
    },
  });
  activationWindow.setMenu(null);
  activationWindow.loadFile(path.join(__dirname, 'activationWindow.html'));
  activationWindow.on('closed', () => {
    activationWindow = null;
  });
  // Block any navigation away from our local file (e.g. external links or redirects)
  activationWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  activationWindow.webContents.on('will-navigate', (event, url) => {
    const allowed = url.startsWith('file://') && url.includes('activationWindow');
    if (!allowed) event.preventDefault();
  });
}

function closeActivationWindow() {
  if (activationWindow && !activationWindow.isDestroyed()) {
    activationWindow.close();
    activationWindow = null;
  }
}

function startActivityIfEnabled() {
  const { activityEnabled } = settings.get();
  if (activityEnabled && licenseManager.isValid()) activityEngine.start();
}

/**
 * Initialize modules and UI. Run after app.ready.
 */
async function initialize() {
  logger = require('./logger');
  logger.ensureLogDir();
  global.logger = logger;

  settings = require('./settings');
  settings.init();
  activityEngine = require('./activityEngine');
  settings.setOnActivityModeChange(() => {
    if (activityEngine && activityEngine.getStatus().state === activityEngine.STATE_ACTIVE) {
      activityEngine.restart();
    }
  });

  licenseManager = require('./licenseManager');
  licenseManager.init();

  tray = require('./tray');
  scheduledWake = require('./scheduledWake');

  scheduledWake.setOnStatusChange(() => {
    if (tray && tray.updateTrayMenu) tray.updateTrayMenu();
  });

  tray.create(app, { onOpenActivation: openActivationWindow, scheduledWake });
  tray.applyLoginItemSettings();

  // Refresh tray menu every 60s when Scheduled Wake is active (to update "X min left")
  scheduledWakeMenuInterval = setInterval(() => {
    if (scheduledWake && scheduledWake.isActive() && tray && tray.updateTrayMenu) {
      tray.updateTrayMenu();
    }
  }, 60 * 1000);

  // IPC: activation window — validate payload to prevent malformed or malicious input
  ipcMain.handle('license:activate', async (event, payload) => {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { success: false, error: 'error', message: 'Invalid request.' };
    }
    const email = typeof payload.email === 'string' ? payload.email.trim() : '';
    const licenseKey = typeof payload.licenseKey === 'string' ? payload.licenseKey.trim() : '';
    if (!email || !licenseKey) {
      return { success: false, error: 'error', message: 'Email and license key are required.' };
    }
    if (email.length > 254 || licenseKey.length > 64) {
      return { success: false, error: 'error', message: 'Invalid input length.' };
    }
    return licenseManager.activate(null, email, licenseKey);
  });
  ipcMain.on('activation-window:activated', () => {
    closeActivationWindow();
    startActivityIfEnabled();
    if (tray && tray.updateTrayMenu) tray.updateTrayMenu();
  });

  // License check: validate stored license or show activation
  const hadLicense = !!licenseManager.getStoredLicense();
  if (hadLicense) {
    await licenseManager.validate();
  }
  if (!licenseManager.isValid()) {
    openActivationWindow();
    licenseManager.startPeriodicValidation(null, 24 * 60 * 60 * 1000, () => {
      activityEngine.stop();
      openActivationWindow();
      if (tray && tray.updateTrayMenu) tray.updateTrayMenu();
    });
  } else {
    const { activityEnabled } = settings.get();
    if (activityEnabled) activityEngine.start();
    licenseManager.startPeriodicValidation(null, 24 * 60 * 60 * 1000, () => {
      activityEngine.stop();
      openActivationWindow();
      if (tray && tray.updateTrayMenu) tray.updateTrayMenu();
    });
  }

  logger.info('App', 'NoAway started');
}

function onBeforeQuit() {
  if (scheduledWakeMenuInterval) {
    clearInterval(scheduledWakeMenuInterval);
    scheduledWakeMenuInterval = null;
  }
  if (scheduledWake && scheduledWake.destroy) scheduledWake.destroy();
  if (licenseManager && licenseManager.stopPeriodicValidation) licenseManager.stopPeriodicValidation();
  if (activityEngine) activityEngine.stop();
  if (tray) tray.destroy();
  if (activationWindow && !activationWindow.isDestroyed()) activationWindow.close();
  if (logger) logger.info('App', 'quit');
}

function main() {
  if (!acquireSingleInstanceLock()) return;

  // No visible window; prevent window from being created by default
  app.dock?.hide?.(); // macOS: hide from dock when no window

  app.whenReady().then(() => {
    return initialize();
  }).catch((err) => {
    console.error('Init failed:', err);
    if (logger) logger.error('App', err.message);
    app.quit();
  });

  app.on('before-quit', onBeforeQuit);

  app.on('window-all-closed', () => {
    // Keep app running for tray
    if (process.platform !== 'darwin') {
      // On Windows/Linux we can stay running with tray only
    }
  });
}

main();
