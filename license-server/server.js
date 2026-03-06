/**
 * NoAway License API server.
 * POST /activate, POST /validate, POST /stripe-webhook
 * Security: Helmet, body size limit, graceful shutdown, DB close.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./database');
const { router, stripeWebhookHandler } = require('./routes');

const app = express();
const PORT = process.env.PORT || 3000;
const BODY_LIMIT = '1kb';

// Security headers (CSP disabled to avoid breaking redirects/APIs)
app.use(helmet({ contentSecurityPolicy: false }));

// Stripe webhook needs raw body — mount before json parser so body is not consumed
app.post(
  '/stripe-webhook',
  express.raw({ type: 'application/json', limit: BODY_LIMIT }),
  stripeWebhookHandler
);

// DoS: limit JSON body size for /activate, /validate, etc.
app.use(express.json({ limit: BODY_LIMIT }));
app.use(cors({ origin: true }));

app.use(router);

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: 'error', message: 'Internal server error' });
});

const server = app.listen(PORT, () => {
  console.log(`NoAway License API listening on port ${PORT}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
