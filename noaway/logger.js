/**
 * Logger module - writes to logs/noaway.log with rotation at 5MB.
 * Event-driven, no busy loops. Uses fs.appendFile for minimal overhead.
 */

const fs = require('fs');
const path = require('path');

let LOG_DIR = null;
let LOG_FILE = null;
const MAX_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const ROTATED_SUFFIX = '.old';

let initialized = false;

/**
 * Resolve log paths (lazy, so safe before app.ready).
 */
function getPaths() {
  if (LOG_DIR) return { LOG_DIR, LOG_FILE };
  const { app } = require('electron');
  LOG_DIR = path.join(app.getPath('userData'), 'logs');
  LOG_FILE = path.join(LOG_DIR, 'noaway.log');
  return { LOG_DIR, LOG_FILE };
}

/**
 * Ensure log directory exists. Safe: permission errors do not crash app.
 */
function ensureLogDir() {
  try {
    const { LOG_DIR: dir } = getPaths();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    initialized = true;
  } catch (err) {
    try { console.error('[Logger] ensureLogDir failed:', err.message); } catch (_) {}
  }
}

/**
 * Rotate log file if it exceeds MAX_SIZE_BYTES.
 * Renames noaway.log to noaway.log.old and starts fresh.
 * Safe: disk full or permission errors are caught; app continues.
 */
function rotateIfNeeded() {
  try {
    const { LOG_FILE: file } = getPaths();
    if (!fs.existsSync(file)) return;
    const stat = fs.statSync(file);
    if (stat.size >= MAX_SIZE_BYTES) {
      const oldPath = file + ROTATED_SUFFIX;
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      fs.renameSync(file, oldPath);
    }
  } catch (err) {
    try { console.error('[Logger] Rotate failed:', err.message); } catch (_) {}
  }
}

/**
 * Format timestamp for log lines.
 */
function timestamp() {
  return new Date().toISOString();
}

/**
 * Write a log entry. Appends asynchronously to avoid blocking.
 * Logging failures (disk full, permissions) never propagate; app stays stable.
 * @param {string} level - INFO, WARN, ERROR, STATE
 * @param {string} eventType - Short event identifier
 * @param {string} [message] - Optional detail
 */
function log(level, eventType, message = '') {
  try {
    if (!initialized) ensureLogDir();
    rotateIfNeeded();
    const { LOG_FILE: file } = getPaths();
    const line = `${timestamp()} [${level}] ${eventType}${message ? ' ' + message : ''}\n`;
    fs.appendFile(file, line, (err) => {
      if (err) try { console.error('[Logger] Write failed:', err.message); } catch (_) {}
    });
  } catch (err) {
    try { console.error('[Logger] Log failed:', err.message); } catch (_) {}
  }
}

module.exports = {
  info: (eventType, message) => log('INFO', eventType, message),
  warn: (eventType, message) => log('WARN', eventType, message),
  error: (eventType, message) => log('ERROR', eventType, message),
  state: (eventType, message) => log('STATE', eventType, message),
  ensureLogDir,
  getLogPath: () => (getPaths().LOG_FILE),
};
