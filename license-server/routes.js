/**
 * API routes: /activate, /validate, /stripe-webhook
 * Security: all inputs sanitized (email, license_key, device_id); rate limits per IP;
 * responses standardized; no internal errors leaked. License flow: activate binds device,
 * validate checks device is allowed; Stripe webhook creates license and sends email.
 */

const crypto = require('crypto');
const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const db = require('./database');
const { normalizeKey, isValidFormat } = require('./licenseKey');
const stripe = require('./stripe');

function signValidatePayload(licenseKey, deviceId, status) {
  const secret = process.env.LICENSE_SIGNING_SECRET || '';
  if (!secret) return null;
  const payload = licenseKey + deviceId + status;
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}

const router = Router();

/**
 * GET /create-checkout-session?email=...&success_url=...&cancel_url=...
 * Redirects to Stripe Checkout. Used by WordPress "Acquista" button.
 */
router.get('/create-checkout-session', async (req, res, next) => {
  try {
    const email = (req.query.email && validator.isEmail(String(req.query.email).trim())) ? String(req.query.email).trim() : null;
    const successUrl = req.query.success_url ? String(req.query.success_url) : null;
    const cancelUrl = req.query.cancel_url ? String(req.query.cancel_url) : null;
    const { url } = await stripe.createCheckoutSession(email, successUrl, cancelUrl);
    if (url) res.redirect(302, url);
    else res.status(500).json({ error: 'Could not create checkout session' });
  } catch (err) {
    next(err);
  }
});

const ACTIVATION_LIMITER = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 20,
  message: { status: 'error', message: 'Too many activation attempts' },
  standardHeaders: true,
  legacyHeaders: false,
});

const VALIDATE_LIMITER = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  message: { status: 'error', message: 'Too many validation requests' },
  standardHeaders: true,
  legacyHeaders: false,
});

function sanitizeEmail(email) {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return validator.isEmail(e) ? e : null;
}

function sanitizeLicenseKey(key) {
  if (typeof key !== 'string') return null;
  const k = normalizeKey(key);
  return isValidFormat(k) ? k : null;
}

function sanitizeDeviceId(id) {
  if (typeof id !== 'string') return null;
  const trimmed = id.trim();
  return trimmed.length >= 16 && trimmed.length <= 128 ? trimmed : null;
}

const VALID_PLATFORMS = new Set(['darwin', 'win32', 'linux']);
const VALID_ACTIVITY_MODES = new Set(['keyboard', 'mouse']);
const VALID_DETECTED_APPS = new Set(['teams', 'slack', 'zoom', 'discord']);
const MAX_APP_VERSION_LENGTH = 20;
const MAX_DETECTED_APPS_LENGTH = 10;

function sanitizeAppVersion(val) {
  if (val === undefined || val === null) return null;
  return String(val).trim().slice(0, MAX_APP_VERSION_LENGTH);
}

function sanitizePlatform(val) {
  if (typeof val !== 'string') return null;
  const p = val.trim().toLowerCase();
  return VALID_PLATFORMS.has(p) ? p : null;
}

function sanitizeActivityMode(val) {
  if (typeof val !== 'string') return null;
  const m = val.trim().toLowerCase();
  return VALID_ACTIVITY_MODES.has(m) ? m : null;
}

function sanitizeDetectedApps(val) {
  if (!Array.isArray(val)) return [];
  const out = [];
  for (let i = 0; i < Math.min(val.length, MAX_DETECTED_APPS_LENGTH); i++) {
    const item = String(val[i]).trim().toLowerCase();
    if (VALID_DETECTED_APPS.has(item)) out.push(item);
  }
  return out;
}

/** active_seconds_today: integer >= 0, <= 86400. Invalid or missing returns null (validation still succeeds). */
function sanitizeActiveSecondsToday(val) {
  if (val === undefined || val === null) return null;
  const n = Number(val);
  if (!Number.isInteger(n) || n < 0 || n > 86400) return null;
  return n;
}

/**
 * POST /activate
 * Body: { license_key, email, device_id }
 * Returns: { status: "valid" } | { status: "limit_reached" } | { status: "error", message }
 */
router.post('/activate', ACTIVATION_LIMITER, (req, res) => {
  const licenseKey = sanitizeLicenseKey(req.body?.license_key);
  const email = sanitizeEmail(req.body?.email);
  const deviceId = sanitizeDeviceId(req.body?.device_id);

  if (!licenseKey || !email || !deviceId) {
    return res.status(400).json({
      status: 'error',
      message: 'license_key, email and device_id are required and must be valid',
    });
  }

  const license = db.findLicenseByKeyAndEmail(licenseKey, email);
  if (!license) {
    console.warn('[activate] License not found or email mismatch:', { key: licenseKey ? 'present' : 'missing', email: email ? 'present' : 'missing' });
    return res.status(404).json({
      status: 'error',
      message: 'License not found or email does not match',
    });
  }

  if (db.isDeviceActivated(licenseKey, deviceId)) {
    return res.json({ status: 'valid' });
  }

  const count = db.getActivationCount(licenseKey);
  if (count >= license.max_devices) {
    console.warn('[activate] Device limit reached:', { licenseKey: licenseKey.substring(0, 12) + '...', count, max: license.max_devices });
    return res.status(403).json({
      status: 'limit_reached',
      message: `Maximum devices (${license.max_devices}) reached for this license`,
    });
  }

  db.addActivation(licenseKey, deviceId);
  res.json({ status: 'valid' });
});

/**
 * POST /validate
 * Body: { license_key, device_id [, app_version, platform, activity_mode, detected_apps, active_seconds_today ] }
 * Returns: { status: "valid" } | { status: "invalid" }
 * Analytics fields are optional; validation never fails due to missing or invalid analytics.
 */
router.post('/validate', VALIDATE_LIMITER, (req, res) => {
  const licenseKey = sanitizeLicenseKey(req.body?.license_key);
  const deviceId = sanitizeDeviceId(req.body?.device_id);

  if (!licenseKey || !deviceId) {
    return res.status(400).json({
      status: 'invalid',
      message: 'license_key and device_id required',
    });
  }

  const valid = db.isLicenseValidForDevice(licenseKey, deviceId);
  const status = valid ? 'valid' : 'invalid';
  const payload = { status };

  if (valid) {
    const app_version = sanitizeAppVersion(req.body?.app_version);
    const platform = sanitizePlatform(req.body?.platform);
    const activity_mode = sanitizeActivityMode(req.body?.activity_mode);
    const detected_apps = sanitizeDetectedApps(req.body?.detected_apps);
    const analytics =
      platform != null && activity_mode != null
        ? { app_version: app_version ?? '', platform, activity_mode, detected_apps }
        : null;
    const active_seconds_today = sanitizeActiveSecondsToday(req.body?.active_seconds_today);
    db.updateLastValidation(licenseKey, deviceId, analytics, active_seconds_today);
    if (analytics) {
      console.log('analytics updated', {
        version: analytics.app_version,
        platform: analytics.platform,
        activity_mode: analytics.activity_mode,
        detected_apps: analytics.detected_apps,
      });
    }
    if (active_seconds_today !== null) {
      console.log('active time analytics', { active_seconds_today });
    }
    const signature = signValidatePayload(licenseKey, deviceId, status);
    if (signature) payload.signature = signature;
  }
  res.json(payload);
});

/**
 * POST /stripe-webhook
 * Raw body required for signature verification. Must be mounted with express.raw for this route.
 */
function stripeWebhookHandler(req, res) {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).send('Missing stripe-signature');
  }

  let event;
  try {
    event = stripe.constructEvent(req.body, signature);
  } catch (err) {
    return res.status(400).send('Webhook Error: invalid signature');
  }

  if (event.type === 'checkout.session.completed') {
    stripe.handleCheckoutCompleted(event.data.object).catch((err) => {
      console.error('[stripe-webhook] handleCheckoutCompleted error:', err.message);
    });
  }

  res.json({ received: true });
}

module.exports = { router, stripeWebhookHandler };
