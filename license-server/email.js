/**
 * Send license email with key, download links, and activation instructions.
 * Uses Nodemailer; configure via env (SMTP_*).
 */

const nodemailer = require('nodemailer');

const DOWNLOAD_URL = process.env.DOWNLOAD_URL || 'https://noaway.app/download';
const APP_NAME = process.env.APP_NAME || 'NoAway';

function getTransporter() {
  const options = {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  };
  return nodemailer.createTransport(options);
}

async function sendLicenseEmail(email, licenseKey) {
  const transporter = getTransporter();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@noaway.app';

  const html = `
    <h2>Grazie per l'acquisto di ${APP_NAME}</h2>
    <p>La tua licenza è stata generata.</p>
    <p><strong>Chiave di licenza:</strong></p>
    <p style="font-family: monospace; font-size: 1.2em; background: #f0f0f0; padding: 12px;">${licenseKey}</p>
    <p><strong>Scarica l'app:</strong></p>
    <p><a href="${DOWNLOAD_URL}">${DOWNLOAD_URL}</a></p>
    <h3>Attivazione</h3>
    <ol>
      <li>Installa ${APP_NAME} sul tuo computer.</li>
      <li>All'avvio, inserisci l'indirizzo email con cui hai acquistato e la chiave di licenza.</li>
      <li>Clicca "Attiva". La licenza è valida per un numero limitato di dispositivi.</li>
    </ol>
    <p>Per assistenza contatta il supporto.</p>
  `;

  const text = `
Grazie per l'acquisto di ${APP_NAME}.

Chiave di licenza: ${licenseKey}

Scarica l'app: ${DOWNLOAD_URL}

Attivazione:
1. Installa ${APP_NAME}.
2. Inserisci email e chiave di licenza nella schermata di attivazione.
3. Clicca Attiva.
  `.trim();

  await transporter.sendMail({
    from,
    to: email,
    subject: `La tua licenza ${APP_NAME}`,
    text,
    html,
  });
}

module.exports = {
  sendLicenseEmail,
  getTransporter,
};
