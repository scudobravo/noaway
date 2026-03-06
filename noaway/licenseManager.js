/**
 * NoAway license manager: local storage (electron-store), activation, periodic validation.
 * Device ID = SHA256(hostname + platform + CPU + MAC).
 * Call init() after app ready.
 */

const crypto = require('crypto');
const os = require('os');
const Store = require('electron-store');

const LICENSE_STORE_NAME = 'noaway-license';

const DEFAULT_API_BASE_URL = process.env.NOAWAY_LICENSE_API_URL || 'https://license.noaway.app';
const REQUEST_TIMEOUT_MS = 10000;
const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 1000;

let store = null;
let lastValidationValid = false;
let validationIntervalId = null;
let validateInProgress = false;

function init() {
  if (store) return;
  store = new Store({ name: LICENSE_STORE_NAME });
}

/**
 * Device ID: SHA256 of hostname, platform, CPU model, and first non-internal MAC.
 * Stable across reboots. If no MAC found (e.g. VM, MAC randomization), uses empty string
 * so ID is still deterministic for that machine. Missing network interfaces are handled.
 */
function getDeviceId() {
  let hostname = '';
  let platform = '';
  let cpuModel = '';
  let mac = '';
  try {
    hostname = os.hostname() || '';
    platform = os.platform() || '';
    const cpus = os.cpus();
    cpuModel = (cpus && cpus[0] && cpus[0].model) ? String(cpus[0].model) : '';
  } catch (_) {}
  try {
    const ifaces = os.networkInterfaces();
    if (ifaces && typeof ifaces === 'object') {
      for (const name of Object.keys(ifaces)) {
        for (const iface of ifaces[name] || []) {
          if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
            mac = iface.mac;
            break;
          }
        }
        if (mac) break;
      }
    }
  } catch (_) {}
  const payload = [hostname, platform, cpuModel, mac].join('|');
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function getStoredLicense() {
  init();
  const key = store.get('license_key');
  const email = store.get('email');
  if (!key || !email) return null;
  return { license_key: key, email };
}

function setStoredLicense(licenseKey, email) {
  init();
  store.set('license_key', licenseKey);
  store.set('email', email);
}

function clearLicense() {
  init();
  store.delete('license_key');
  store.delete('email');
  lastValidationValid = false;
}

function getApiBaseUrl() {
  init();
  return store.get('api_base_url', DEFAULT_API_BASE_URL);
}

function setApiBaseUrl(url) {
  init();
  store.set('api_base_url', url);
}

/**
 * Fetch with timeout. AbortController cancels after REQUEST_TIMEOUT_MS.
 */
function fetchWithTimeout(url, options, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const to = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(to));
}

/**
 * POST /activate with license_key, email, device_id. Network failures and timeouts
 * do not crash; invalid JSON is handled safely.
 */
async function activate(apiBaseUrl, email, licenseKey) {
  const base = (apiBaseUrl || getApiBaseUrl()).replace(/\/$/, '');
  const deviceId = getDeviceId();
  let data = {};
  try {
    const res = await fetchWithTimeout(`${base}/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        license_key: (licenseKey || '').trim().toUpperCase(),
        email: (email || '').trim(),
        device_id: deviceId,
      }),
    });
    const text = await res.text();
    try {
      data = text ? JSON.parse(text) : {};
    } catch (_) {
      data = {};
    }
  } catch (err) {
    return {
      success: false,
      error: 'error',
      message: err.name === 'AbortError' ? 'Request timed out.' : 'Attivazione non riuscita. Controlla la connessione.',
    };
  }
  if (data.status === 'valid') {
    setStoredLicense((licenseKey || '').trim().toUpperCase(), (email || '').trim());
    lastValidationValid = true;
    return { success: true };
  }
  if (data.status === 'limit_reached') {
    return { success: false, error: 'limit_reached', message: data.message || 'Numero massimo di dispositivi raggiunto per questa licenza.' };
  }
  return {
    success: false,
    error: data.status || 'error',
    message: data.message || 'Attivazione non riuscita. Controlla email e chiave.',
  };
}

/**
 * Signing secret for /validate response verification (must match server LICENSE_SIGNING_SECRET).
 * Set at build time or via env NOAWAY_LICENSE_SIGNING_SECRET.
 *
 * Lightweight anti-tamper only: the same secret exists in the client, so anyone with the app
 * can forge responses. This deters casual tampering but not determined attackers.
 * TODO: Migrate to asymmetric signing (server signs with private key, client verifies with
 * public key) so the client never holds the signing secret.
 */
function getSigningSecret() {
  return process.env.NOAWAY_LICENSE_SIGNING_SECRET || '';
}

/**
 * Verify HMAC-SHA256 signature with constant-time comparison.
 * When client has NOAWAY_LICENSE_SIGNING_SECRET set, signature is mandatory and must verify.
 * @returns {boolean} true if signature valid or verification not required (no secret on client)
 */
function verifyValidateSignature(licenseKey, deviceId, status, signature) {
  const secret = getSigningSecret();
  if (!secret) {
    return !signature; // no secret: accept only when server did not send signature (backwards compat)
  }
  if (!signature || typeof signature !== 'string') {
    return false; // client has secret => signature mandatory
  }
  // SHA256 hex is always 64 chars; reject wrong length to avoid bypass
  if (signature.length !== 64 || !/^[a-f0-9]+$/.test(signature)) {
    return false;
  }
  const payload = licenseKey + deviceId + status;
  const expectedHex = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
  const expectedBuf = Buffer.from(expectedHex, 'hex');
  let sigBuf;
  try {
    sigBuf = Buffer.from(signature, 'hex');
  } catch (_) {
    return false;
  }
  if (expectedBuf.length !== sigBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, sigBuf);
}

/**
 * Build analytics payload for /validate. Fail-safe: missing data does not break validation.
 */
function getAnalyticsPayload() {
  let app_version = '';
  try {
    const { app } = require('electron');
    if (app && typeof app.getVersion === 'function') app_version = String(app.getVersion()).slice(0, 20);
  } catch (_) {}
  const platform = typeof process.platform === 'string' ? process.platform : '';
  let activity_mode = 'keyboard';
  try {
    const settings = require('./settings');
    if (settings && typeof settings.getActivityMode === 'function') activity_mode = settings.getActivityMode();
  } catch (_) {}
  return { app_version, platform, activity_mode };
}

/**
 * Single validate attempt. Used by validate() with retry and concurrency guard.
 * Payload includes optional analytics (app_version, platform, activity_mode, detected_apps).
 */
async function validateOnce(base, license, deviceId, analytics = {}) {
  const body = {
    license_key: license.license_key,
    device_id: deviceId,
    app_version: analytics.app_version ?? '',
    platform: analytics.platform ?? '',
    activity_mode: analytics.activity_mode ?? 'keyboard',
    detected_apps: Array.isArray(analytics.detected_apps) ? analytics.detected_apps : [],
    active_seconds_today: typeof analytics.active_seconds_today === 'number' ? analytics.active_seconds_today : undefined,
  };
  const res = await fetchWithTimeout(`${base}/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch (_) {}
  if (data.status !== 'valid') {
    return false;
  }
  return verifyValidateSignature(license.license_key, deviceId, data.status, data.signature);
}

/**
 * POST /validate with license_key, device_id. Returns true if status === 'valid' and
 * signature verifies. Timeout 10s, max 2 retries with 1s backoff. Concurrent calls
 * are serialized so only one validation runs at a time.
 */
async function validate(apiBaseUrl) {
  const license = getStoredLicense();
  if (!license) return false;
  if (validateInProgress) return lastValidationValid;
  validateInProgress = true;
  const base = (apiBaseUrl || getApiBaseUrl()).replace(/\/$/, '');
  const deviceId = getDeviceId();
  const analytics = getAnalyticsPayload();
  try {
    const processMonitor = require('./processMonitor');
    analytics.detected_apps = await processMonitor.detectCommunicationApps().catch(() => []);
  } catch (_) {
    analytics.detected_apps = [];
  }
  try {
    const activityEngine = require('./activityEngine');
    if (activityEngine && typeof activityEngine.getDailyActiveSeconds === 'function') {
      analytics.active_seconds_today = activityEngine.getDailyActiveSeconds();
      if (typeof global.logger !== 'undefined' && analytics.active_seconds_today != null) {
        global.logger.info('active time analytics', String(analytics.active_seconds_today));
      }
    }
  } catch (_) {}
  let valid = false;
  try {
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        valid = await validateOnce(base, license, deviceId, analytics);
        break;
      } catch (err) {
        if (attempt === MAX_RETRIES) valid = false;
        else await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
  } catch (_) {
    valid = false;
  } finally {
    validateInProgress = false;
  }
  lastValidationValid = valid;
  return valid;
}

/**
 * Run validation now and then every intervalMs. Calls onInvalid() when validation fails.
 * @param {string} [apiBaseUrl]
 * @param {number} [intervalMs] Default 24 * 60 * 60 * 1000 (24h)
 * @param {() => void} [onInvalid] Called when license is invalid (clear UI / disable premium)
 */
function startPeriodicValidation(apiBaseUrl, intervalMs, onInvalid) {
  if (validationIntervalId) {
    clearInterval(validationIntervalId);
    validationIntervalId = null;
  }
  const interval = intervalMs ?? 24 * 60 * 60 * 1000;
  const url = apiBaseUrl || getApiBaseUrl();
  const onInvalidCb = typeof onInvalid === 'function' ? onInvalid : () => {};

  async function run() {
    const valid = await validate(url);
    if (!valid) onInvalidCb();
  }

  run();
  validationIntervalId = setInterval(run, interval);
}

function stopPeriodicValidation() {
  if (validationIntervalId) {
    clearInterval(validationIntervalId);
    validationIntervalId = null;
  }
}

/**
 * True if we have a stored license and last validation was valid.
 * Call validate() at least once (e.g. on startup) to set lastValidationValid.
 */
function isValid() {
  const license = getStoredLicense();
  return !!license && lastValidationValid;
}

module.exports = {
  init,
  getDeviceId,
  getStoredLicense,
  setStoredLicense,
  clearLicense,
  getApiBaseUrl,
  setApiBaseUrl,
  activate,
  validate,
  startPeriodicValidation,
  stopPeriodicValidation,
  isValid,
};
