/**
 * Scheduled Wake - Keep PC active for a set duration (e.g. timed downloads).
 * Starts activity engine for the given time, then stops and restores previous
 * "Keep Active" state if it was on.
 */

const activityEngine = require('./activityEngine');
const settings = require('./settings');

let timeoutId = null;
let endTime = null;
let wasActivityEnabled = false;
let onStatusChange = () => {};

const PRESETS_MS = {
  '30m': 30 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '2h': 2 * 60 * 60 * 1000,
  '4h': 4 * 60 * 60 * 1000,
  '8h': 8 * 60 * 60 * 1000,
};

function clearTimer() {
  if (timeoutId != null) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  endTime = null;
}

/**
 * When timer expires: stop engine and restore "Keep Active" if it was on.
 */
function onTimerEnd() {
  clearTimer();
  activityEngine.stop();
  if (wasActivityEnabled) {
    activityEngine.start();
  }
  if (typeof global.logger !== 'undefined') {
    global.logger.info('ScheduledWake', 'timer ended, engine stopped');
  }
  onStatusChange();
}

/**
 * Start scheduled wake for the given duration (ms).
 * Saves current activityEnabled state to restore after timer.
 * @param {number} durationMs
 */
function start(durationMs) {
  if (durationMs <= 0) return;
  cancel();
  wasActivityEnabled = settings.get().activityEnabled;
  endTime = Date.now() + durationMs;
  activityEngine.start();
  timeoutId = setTimeout(onTimerEnd, durationMs);
  if (typeof global.logger !== 'undefined') {
    global.logger.info('ScheduledWake', `started for ${Math.round(durationMs / 60000)} min`);
  }
  onStatusChange();
}

/**
 * Cancel scheduled wake. Stops engine and restores previous Keep Active state.
 */
function cancel() {
  if (!isActive()) return;
  clearTimer();
  activityEngine.stop();
  if (wasActivityEnabled) {
    activityEngine.start();
  }
  if (typeof global.logger !== 'undefined') {
    global.logger.info('ScheduledWake', 'cancelled');
  }
  onStatusChange();
}

/**
 * @returns {boolean}
 */
function isActive() {
  return endTime != null && timeoutId != null;
}

/**
 * @returns {{ active: boolean, endTime: number|null, remainingMs: number|null }}
 */
function getStatus() {
  if (!isActive()) {
    return { active: false, endTime: null, remainingMs: null };
  }
  const remaining = Math.max(0, endTime - Date.now());
  return {
    active: true,
    endTime,
    remainingMs: remaining,
  };
}

/**
 * Get preset durations for menu labels.
 * @returns {Array<{ key: string, label: string, durationMs: number }>}
 */
function getPresets() {
  return [
    { key: '30m', label: '30 minutes', durationMs: PRESETS_MS['30m'] },
    { key: '1h', label: '1 hour', durationMs: PRESETS_MS['1h'] },
    { key: '2h', label: '2 hours', durationMs: PRESETS_MS['2h'] },
    { key: '4h', label: '4 hours', durationMs: PRESETS_MS['4h'] },
    { key: '8h', label: '8 hours', durationMs: PRESETS_MS['8h'] },
  ];
}

/**
 * Format remaining time for tray (e.g. "1h 23m" or "45m").
 * @param {number} remainingMs
 * @returns {string}
 */
function formatRemaining(remainingMs) {
  if (remainingMs <= 0) return '0m';
  const totalMin = Math.ceil(remainingMs / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function setOnStatusChange(fn) {
  onStatusChange = typeof fn === 'function' ? fn : () => {};
}

/**
 * Clean up on app quit (main will call activityEngine.stop separately).
 */
function destroy() {
  clearTimer();
}

module.exports = {
  start,
  cancel,
  isActive,
  getStatus,
  getPresets,
  formatRemaining,
  setOnStatusChange,
  destroy,
};
