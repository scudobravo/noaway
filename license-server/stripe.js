/**
 * Stripe Checkout and webhook handling.
 * License creation is triggered by webhook after successful payment.
 */

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { generateLicenseKey } = require('./licenseKey');
const db = require('./database');
const { sendLicenseEmail } = require('./email');

const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const MAX_DEVICES = parseInt(process.env.MAX_DEVICES_PER_LICENSE || '2', 10);

/**
 * Create Stripe Checkout Session for redirect from WordPress.
 * Price ID from env (STRIPE_PRICE_ID). success_url/cancel_url from env or params.
 */
async function createCheckoutSession(customerEmail, successUrl, cancelUrl, metadata = {}) {
  const success = successUrl || process.env.STRIPE_SUCCESS_URL || 'https://noaway.app/thank-you';
  const cancel = cancelUrl || process.env.STRIPE_CANCEL_URL || 'https://noaway.app/';
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer_email: customerEmail || undefined,
    line_items: [
      {
        price: process.env.STRIPE_PRICE_ID,
        quantity: 1,
      },
    ],
    success_url: success,
    cancel_url: cancel,
    metadata: { ...metadata },
  });
  return { url: session.url, sessionId: session.id };
}

/**
 * Verify webhook signature and parse event.
 */
function constructEvent(body, signature) {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }
  return stripe.webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
}

/**
 * Handle checkout.session.completed: create license and send email.
 * Email failures are logged but do not crash the webhook handler; license is already created.
 */
async function handleCheckoutCompleted(session) {
  const email = session.customer_email || session.customer_details?.email;
  if (!email) {
    console.error('[stripe] No email in session:', session.id);
    return;
  }

  const licenseKey = generateLicenseKey();
  db.insertLicense(email, licenseKey, MAX_DEVICES);

  try {
    await sendLicenseEmail(email, licenseKey);
  } catch (err) {
    console.error('[stripe] Failed to send license email:', err.message);
  }
}

module.exports = {
  stripe,
  createCheckoutSession,
  constructEvent,
  handleCheckoutCompleted,
};
