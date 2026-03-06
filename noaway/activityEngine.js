/**
 * Activity engine - state machine (ACTIVE | PAUSED).
 * Manages powerSaveBlocker, scheduler, and idle monitor. No duplicate blockers.
 */

const { powerSaveBlocker } = require('electron');
const scheduler = require('./scheduler');
const idleMonitor = require('./idleMonitor');
const settings = require('./settings');
const { keyboardStrategy, mouseStrategy } = require('./activityStrategies');

const STATE_ACTIVE = 'ACTIVE';
const STATE_PAUSED = 'PAUSED';

let state = STATE_PAUSED;
let powerSaveId = null;
let onStatusChange = () => {};

/** Active hours analytics: timestamp when current session started, or null if paused. */
let activeStartTimestamp = null;
/** Accumulated seconds the engine was active today (reset at day change). */
let dailyActiveSeconds = 0;
/** Current day (YYYY-MM-DD) for daily reset. */
let currentDay = '';

function getCurrentDay() {
  return new Date().toISOString().slice(0, 10);
}

function ensureDayReset() {
  const today = getCurrentDay();
  if (currentDay && currentDay !== today) {
    dailyActiveSeconds = 0;
  }
  currentDay = today;
}

/**
 * Choose strategy for this tick: 80% preferred mode, 20% other (keyboard vs mouse).
 * @param {"keyboard"|"mouse"} activityMode
 * @returns {"keyboard"|"mouse"}
 */
function selectStrategy(activityMode) {
  const usePreferred = Math.random() < 0.8;
  if (activityMode === 'mouse') {
    return usePreferred ? 'mouse' : 'keyboard';
  }
  return usePreferred ? 'keyboard' : 'mouse';
}

/**
 * Simulate activity using selected strategy (keyboard or mouse). 80/20 mix for realism.
 * Strategies are called from activityStrategies (robotjs wrapped in try/catch there).
 */
function simulateActivity() {
  const activityMode = settings.getActivityMode();
  const strategy = selectStrategy(activityMode);
  const selectedMode = strategy;
  const ok = strategy === 'keyboard' ? keyboardStrategy() : mouseStrategy();
  if (typeof global.logger !== 'undefined') {
    global.logger.info('[activity]', `mode=${activityMode} strategy=${selectedMode} simulated`);
  }
  if (!ok && typeof global.logger !== 'undefined') {
    global.logger.warn('[activity]', 'strategy returned false');
  }
}

/**
 * Start power save blocker (prevent display sleep). Ensure no duplicate.
 */
function startPowerBlocker() {
  if (powerSaveId != null) return;
  powerSaveId = powerSaveBlocker.start('prevent-display-sleep');
  if (typeof global.logger !== 'undefined') {
    global.logger.state('PowerBlocker', 'started');
  }
}

/**
 * Stop power save blocker when activity mode is disabled.
 */
function stopPowerBlocker() {
  if (powerSaveId == null) return;
  try {
    if (powerSaveBlocker.isStarted(powerSaveId)) {
      powerSaveBlocker.stop(powerSaveId);
    }
  } catch (_) {}
  powerSaveId = null;
  if (typeof global.logger !== 'undefined') {
    global.logger.state('PowerBlocker', 'stopped');
  }
}

/**
 * Start activity: blocker + scheduler + idle monitor.
 */
function start() {
  if (state === STATE_ACTIVE) return;
  ensureDayReset();
  activeStartTimestamp = Date.now();
  const { idleThreshold } = settings.get();
  startPowerBlocker();
  scheduler.start(simulateActivity);
  idleMonitor.start(idleThreshold, simulateActivity);
  state = STATE_ACTIVE;
  if (typeof global.logger !== 'undefined') {
    global.logger.state('Engine', STATE_ACTIVE);
  }
  onStatusChange(state);
}

/**
 * Stop activity: release blocker, stop scheduler and idle monitor.
 */
function stop() {
  if (state === STATE_PAUSED) return;
  if (activeStartTimestamp != null) {
    const durationSec = (Date.now() - activeStartTimestamp) / 1000;
    dailyActiveSeconds += durationSec;
    activeStartTimestamp = null;
  }
  stopPowerBlocker();
  scheduler.stop();
  idleMonitor.stop();
  state = STATE_PAUSED;
  if (typeof global.logger !== 'undefined') {
    global.logger.state('Engine', STATE_PAUSED);
  }
  onStatusChange(state);
}

/**
 * Restart engine (stop then start). Refreshes scheduler and idle monitor with current settings
 * (e.g. after activityMode change). Safe when scheduledWake is active: the timer keeps running
 * and on expiry scheduledWake will still call stop() then optionally start(), so state stays consistent.
 */
function restart() {
  stop();
  start();
}

/**
 * Get current status. Safe: never throws (powerSaveBlocker.isStarted can throw on some platforms).
 */
function getStatus() {
  let powerSaveActive = false;
  try {
    powerSaveActive = powerSaveId != null && powerSaveBlocker.isStarted(powerSaveId);
  } catch (_) {}
  return { state, powerSaveActive };
}

/**
 * Register callback for state changes (e.g. tray update).
 * @param {function(string): void} fn - Called with STATE_ACTIVE or STATE_PAUSED.
 */
function setOnStatusChange(fn) {
  onStatusChange = typeof fn === 'function' ? fn : () => {};
}

/**
 * Update idle threshold at runtime (e.g. from settings).
 */
function setIdleThreshold(seconds) {
  idleMonitor.setThreshold(seconds);
  scheduler.restart();
}

/**
 * Return total seconds the activity engine was active today (for analytics).
 * Includes current session if engine is ACTIVE. Resets at day change.
 */
function getDailyActiveSeconds() {
  ensureDayReset();
  let total = dailyActiveSeconds;
  if (state === STATE_ACTIVE && activeStartTimestamp != null) {
    total += (Date.now() - activeStartTimestamp) / 1000;
  }
  return Math.floor(total);
}

module.exports = {
  start,
  stop,
  restart,
  getStatus,
  setOnStatusChange,
  setIdleThreshold,
  getDailyActiveSeconds,
  STATE_ACTIVE,
  STATE_PAUSED,
};
