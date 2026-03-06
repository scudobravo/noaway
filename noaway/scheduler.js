/**
 * Scheduler - fires a callback at randomized intervals.
 * Formula: baseInterval + random(-90s, +90s). Interval between 3–7 minutes => base ~300s, jitter ±90s.
 * Prevents overlapping timers and allows restart. Sometimes skips an interval for unpredictability.
 */

const JITTER_RANGE_SEC = 90; // ±90 seconds
const BASE_INTERVAL_SEC = 300; // 5 minutes base => range ~3.5–6.5 min with jitter
const SKIP_CHANCE = 0.15; // 15% chance to skip an interval

let timeoutId = null;
let callback = () => {};

/**
 * Random integer in [min, max] inclusive.
 */
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Next interval in seconds: base + random(-90, +90), clamped to reasonable range (e.g. 180–420).
 */
function nextIntervalSec() {
  const jitter = randomInt(-JITTER_RANGE_SEC, JITTER_RANGE_SEC);
  const sec = Math.max(180, Math.min(420, BASE_INTERVAL_SEC + jitter));
  return sec * 1000; // return ms for setTimeout
}

/**
 * Schedule next run. If SKIP_CHANCE, schedule again without invoking callback.
 */
function schedule() {
  const ms = nextIntervalSec();
  timeoutId = setTimeout(() => {
    timeoutId = null;
    if (Math.random() < SKIP_CHANCE) {
      schedule(); // skip this tick, reschedule
      return;
    }
    if (typeof global.logger !== 'undefined') {
      global.logger.info('[scheduler]', 'triggered simulateActivity');
    }
    try {
      callback();
    } catch (err) {
      if (typeof global.logger !== 'undefined') {
        global.logger.error('Scheduler', err.message);
      }
    }
    schedule();
  }, ms);
}

/**
 * Start the scheduler.
 * @param {function(): void} fn - Called at each (non-skipped) interval.
 */
function start(fn) {
  stop();
  callback = typeof fn === 'function' ? fn : () => {};
  schedule();
}

/**
 * Stop the scheduler and clear any pending timer.
 */
function stop() {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }
  callback = () => {};
}

/**
 * Restart with same callback (e.g. after settings change).
 */
function restart() {
  if (callback && callback !== (() => {})) {
    stop();
    start(callback);
  }
}

module.exports = {
  start,
  stop,
  restart,
};
