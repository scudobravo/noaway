/**
 * SQLite database for licenses and activations.
 * Security: all queries use prepared statements (parameterized) to prevent SQL injection.
 * WAL mode enabled for durability. Migrations (ensureAnalyticsColumns) are additive only.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'licenses.db');
let db = null;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initSchema(db);
  }
  return db;
}

function initSchema(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS licenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL,
      license_key TEXT NOT NULL UNIQUE,
      max_devices INTEGER NOT NULL DEFAULT 2,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      license_key TEXT NOT NULL,
      device_id TEXT NOT NULL,
      activated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(license_key, device_id),
      FOREIGN KEY (license_key) REFERENCES licenses(license_key)
    );

    CREATE INDEX IF NOT EXISTS idx_licenses_key ON licenses(license_key);
    CREATE INDEX IF NOT EXISTS idx_activations_license ON activations(license_key);
    CREATE INDEX IF NOT EXISTS idx_activations_device ON activations(device_id);
  `);
  ensureAnalyticsColumns(database);
}

/**
 * Add analytics columns to licenses if they do not exist (backwards compatible).
 * Same migration pattern as last_validation / last_device.
 */
function ensureAnalyticsColumns(database) {
  const info = database.prepare('PRAGMA table_info(licenses)').all();
  const names = info.map((c) => c.name);
  if (!names.includes('last_validation')) {
    database.exec('ALTER TABLE licenses ADD COLUMN last_validation TEXT');
  }
  if (!names.includes('last_device')) {
    database.exec('ALTER TABLE licenses ADD COLUMN last_device TEXT');
  }
  if (!names.includes('last_version')) {
    database.exec('ALTER TABLE licenses ADD COLUMN last_version TEXT');
  }
  if (!names.includes('last_platform')) {
    database.exec('ALTER TABLE licenses ADD COLUMN last_platform TEXT');
  }
  if (!names.includes('last_activity_mode')) {
    database.exec('ALTER TABLE licenses ADD COLUMN last_activity_mode TEXT');
  }
  if (!names.includes('last_detected_apps')) {
    database.exec('ALTER TABLE licenses ADD COLUMN last_detected_apps TEXT');
  }
  if (!names.includes('last_active_seconds')) {
    database.exec('ALTER TABLE licenses ADD COLUMN last_active_seconds INTEGER');
  }
  if (!names.includes('total_active_seconds')) {
    database.exec('ALTER TABLE licenses ADD COLUMN total_active_seconds INTEGER');
  }
}

function findLicenseByKey(licenseKey) {
  const db = getDb();
  return db.prepare('SELECT * FROM licenses WHERE license_key = ?').get(licenseKey) || null;
}

function findLicenseByKeyAndEmail(licenseKey, email) {
  const db = getDb();
  return db.prepare('SELECT * FROM licenses WHERE license_key = ? AND LOWER(email) = LOWER(?)').get(licenseKey, email) || null;
}

function getActivationCount(licenseKey) {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) AS count FROM activations WHERE license_key = ?').get(licenseKey);
  return row ? row.count : 0;
}

function isDeviceActivated(licenseKey, deviceId) {
  const db = getDb();
  const row = db.prepare('SELECT 1 FROM activations WHERE license_key = ? AND device_id = ?').get(licenseKey, deviceId);
  return !!row;
}

function addActivation(licenseKey, deviceId) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO activations (license_key, device_id) VALUES (?, ?)');
  stmt.run(licenseKey, deviceId);
}

function insertLicense(email, licenseKey, maxDevices = 2) {
  const db = getDb();
  const stmt = db.prepare('INSERT INTO licenses (email, license_key, max_devices) VALUES (?, ?, ?)');
  stmt.run(email, licenseKey, maxDevices);
}

function isLicenseValidForDevice(licenseKey, deviceId) {
  const license = findLicenseByKey(licenseKey);
  if (!license) return false;
  if (isDeviceActivated(licenseKey, deviceId)) return true;
  const count = getActivationCount(licenseKey);
  return count < license.max_devices;
}

/**
 * Update last validation and optional product analytics. Analytics fields are optional;
 * if missing, only last_validation and last_device are updated (fail-safe for old clients).
 * When activeSecondsToday is a valid number, also updates last_active_seconds and increments total_active_seconds.
 * @param {string} licenseKey
 * @param {string} deviceId
 * @param {{ app_version?: string, platform?: string, activity_mode?: string, detected_apps?: string[] }} [analytics]
 * @param {number} [activeSecondsToday] Integer 0..86400; only daily/total active seconds stored, no timestamps.
 */
function updateLastValidation(licenseKey, deviceId, analytics = null, activeSecondsToday = null) {
  const db = getDb();
  const hasAnalytics = analytics && typeof analytics === 'object';
  const appVersion = hasAnalytics && analytics.app_version != null ? String(analytics.app_version) : null;
  const platform = hasAnalytics && analytics.platform != null ? String(analytics.platform) : null;
  const activityMode = hasAnalytics && analytics.activity_mode != null ? String(analytics.activity_mode) : null;
  const detectedApps = hasAnalytics && Array.isArray(analytics.detected_apps)
    ? JSON.stringify(analytics.detected_apps)
    : null;

  if (appVersion !== null && platform !== null && activityMode !== null && detectedApps !== null) {
    const stmt = db.prepare(`
      UPDATE licenses
      SET last_validation = datetime('now'),
          last_device = ?,
          last_version = ?,
          last_platform = ?,
          last_activity_mode = ?,
          last_detected_apps = ?
      WHERE license_key = ?
    `);
    stmt.run(deviceId, appVersion, platform, activityMode, detectedApps, licenseKey);
  } else {
    const stmt = db.prepare(`
      UPDATE licenses
      SET last_validation = datetime('now'),
          last_device = ?
      WHERE license_key = ?
    `);
    stmt.run(deviceId, licenseKey);
  }

  if (typeof activeSecondsToday === 'number' && Number.isInteger(activeSecondsToday) && activeSecondsToday >= 0 && activeSecondsToday <= 86400) {
    const stmtActive = db.prepare(`
      UPDATE licenses
      SET last_active_seconds = ?,
          total_active_seconds = COALESCE(total_active_seconds, 0) + ?
      WHERE license_key = ?
    `);
    stmtActive.run(activeSecondsToday, activeSecondsToday, licenseKey);
  }
}

/*
 * Example analytics queries (product usage only; no PII):
 *
 * Active licenses (validated in last 7 days):
 *   SELECT COUNT(*) FROM licenses
 *   WHERE last_validation > datetime('now','-7 days');
 *
 * Most used app versions:
 *   SELECT last_version, COUNT(*)
 *   FROM licenses
 *   WHERE last_version IS NOT NULL AND last_version != ''
 *   GROUP BY last_version
 *   ORDER BY COUNT(*) DESC;
 *
 * Usage by platform:
 *   SELECT last_platform, COUNT(*)
 *   FROM licenses
 *   WHERE last_platform IN ('darwin','win32','linux')
 *   GROUP BY last_platform;
 *
 * Licenses with Teams detected:
 *   SELECT COUNT(*) FROM licenses
 *   WHERE last_detected_apps LIKE '%teams%';
 *
 * Licenses with Slack detected:
 *   SELECT COUNT(*) FROM licenses
 *   WHERE last_detected_apps LIKE '%slack%';
 *
 * Activity mode distribution:
 *   SELECT last_activity_mode, COUNT(*)
 *   FROM licenses
 *   WHERE last_activity_mode IN ('keyboard','mouse')
 *   GROUP BY last_activity_mode;
 *
 * Active hours analytics (only seconds stored; no timestamps or behavior logs):
 *
 * Daily average active time (seconds):
 *   SELECT AVG(last_active_seconds) FROM licenses WHERE last_active_seconds IS NOT NULL;
 *
 * Total hours kept active (all licenses):
 *   SELECT SUM(total_active_seconds)/3600 FROM licenses;
 *
 * Top active licenses by total seconds:
 *   SELECT license_key, total_active_seconds
 *   FROM licenses
 *   WHERE total_active_seconds IS NOT NULL
 *   ORDER BY total_active_seconds DESC
 *   LIMIT 10;
 */

/**
 * Close database connection. Call on graceful shutdown (SIGINT/SIGTERM).
 */
function close() {
  if (db) {
    try {
      db.close();
    } catch (err) {
      console.error('DB close error:', err.message);
    }
    db = null;
  }
}

module.exports = {
  getDb,
  close,
  findLicenseByKey,
  findLicenseByKeyAndEmail,
  getActivationCount,
  isDeviceActivated,
  addActivation,
  insertLicense,
  isLicenseValidForDevice,
  updateLastValidation,
};
