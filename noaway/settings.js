/**
 * Settings module - persists autoStart, activityEnabled, idleThreshold via electron-store.
 * Must be required after app is ready (electron-store uses app.getPath).
 */

const Store = require('electron-store');

const IDLE_THRESHOLD_MIN = 30;
const IDLE_THRESHOLD_MAX = 3600;
const VALID_ACTIVITY_MODES = ['keyboard', 'mouse'];

const DEFAULTS = {
  autoStart: false,
  activityEnabled: true,
  idleThreshold: 240, // seconds
  activityMode: 'keyboard', // "keyboard" | "mouse"
};

let store = null;
let onActivityModeChange = () => {};

/**
 * Initialize store. Call once when app is ready.
 */
function init() {
  if (store) return store;
  store = new Store({
    defaults: DEFAULTS,
    name: 'noaway-settings',
  });
  return store;
}

/**
 * Clamp and validate a single value. Returns valid value or default (resilient to corrupted store).
 */
function sanitizeIdleThreshold(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return DEFAULTS.idleThreshold;
  return Math.max(IDLE_THRESHOLD_MIN, Math.min(IDLE_THRESHOLD_MAX, Math.floor(n)));
}

function sanitizeActivityMode(val) {
  return VALID_ACTIVITY_MODES.includes(val) ? val : DEFAULTS.activityMode;
}

/**
 * Get current settings object. All values validated; corrupted store resets to defaults.
 */
function get() {
  if (!store) init();
  return {
    autoStart: Boolean(store.get('autoStart', DEFAULTS.autoStart)),
    activityEnabled: Boolean(store.get('activityEnabled', DEFAULTS.activityEnabled)),
    idleThreshold: sanitizeIdleThreshold(store.get('idleThreshold', DEFAULTS.idleThreshold)),
    activityMode: sanitizeActivityMode(store.get('activityMode', DEFAULTS.activityMode)),
  };
}

/**
 * Get current activity mode: "keyboard" or "mouse".
 */
function getActivityMode() {
  if (!store) init();
  return sanitizeActivityMode(store.get('activityMode', DEFAULTS.activityMode));
}

/**
 * Set one or more values.
 * @param {Partial<{ autoStart: boolean, activityEnabled: boolean, idleThreshold: number }>} values
 */
function set(values) {
  if (!store) init();
  const prevMode = sanitizeActivityMode(store.get('activityMode', DEFAULTS.activityMode));
  if (values.autoStart !== undefined) store.set('autoStart', Boolean(values.autoStart));
  if (values.activityEnabled !== undefined) store.set('activityEnabled', Boolean(values.activityEnabled));
  if (values.idleThreshold !== undefined) store.set('idleThreshold', sanitizeIdleThreshold(values.idleThreshold));
  if (values.activityMode !== undefined) {
    const next = sanitizeActivityMode(values.activityMode);
    store.set('activityMode', next);
    if (next !== prevMode) onActivityModeChange();
  }
}

/**
 * Register callback when activityMode changes (e.g. to restart activity engine).
 * @param {function(): void} fn
 */
function setOnActivityModeChange(fn) {
  onActivityModeChange = typeof fn === 'function' ? fn : () => {};
}

module.exports = {
  init,
  get,
  set,
  getActivityMode,
  setOnActivityModeChange,
  DEFAULTS,
};
