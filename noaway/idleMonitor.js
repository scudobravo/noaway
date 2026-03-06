/**
 * Idle monitor - checks powerMonitor.getSystemIdleTime() every 30 seconds.
 * If idleTime > threshold (default 240s), invokes onIdleExceeded callback.
 * If idleTime < 60s, does nothing. Event-driven, no busy loops.
 */

const { powerMonitor } = require('electron');

const CHECK_INTERVAL_MS = 30 * 1000; // 30 seconds
const DO_NOTHING_THRESHOLD = 60; // seconds - below this we do nothing

let intervalId = null;
let currentThreshold = 240;
let onIdleExceeded = () => {};

/**
 * Single check: get idle time, compare to threshold.
 */
function tick() {
  try {
    const idleTime = powerMonitor.getSystemIdleTime();
    if (idleTime < DO_NOTHING_THRESHOLD) return;
    if (idleTime >= currentThreshold) {
      if (typeof global.logger !== 'undefined') {
        global.logger.info('[idleMonitor]', 'idle=' + Math.round(idleTime) + ' triggered simulateActivity');
      }
      onIdleExceeded(idleTime);
    }
  } catch (err) {
    // getSystemIdleTime can throw on some systems
    if (typeof global.logger !== 'undefined') {
      global.logger.error('IdleMonitor', err.message);
    }
  }
}

/**
 * Start the idle check interval.
 * @param {number} thresholdSeconds - Trigger when idle exceeds this (e.g. 240).
 * @param {function(number): void} callback - Called with current idle time when exceeded.
 */
function start(thresholdSeconds, callback) {
  stop();
  currentThreshold = Math.max(DO_NOTHING_THRESHOLD, thresholdSeconds);
  onIdleExceeded = typeof callback === 'function' ? callback : () => {};
  intervalId = setInterval(tick, CHECK_INTERVAL_MS);
  tick(); // one immediate check
}

/**
 * Stop the idle monitor.
 */
function stop() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  onIdleExceeded = () => {};
}

/**
 * Update threshold without restarting.
 */
function setThreshold(seconds) {
  currentThreshold = Math.max(DO_NOTHING_THRESHOLD, seconds);
}

module.exports = {
  start,
  stop,
  setThreshold,
};
