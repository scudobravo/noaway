/**
 * Activation window renderer: collect email + license key, call main to activate.
 * Uses preload contextBridge (window.noaway) when contextIsolation is true.
 */

const emailEl = document.getElementById('email');
const licenseKeyEl = document.getElementById('licenseKey');
const activateBtn = document.getElementById('activateBtn');
const errorEl = document.getElementById('error');

function showError(message) {
  errorEl.textContent = message || 'Errore sconosciuto';
  errorEl.classList.add('visible');
}

function hideError() {
  errorEl.textContent = '';
  errorEl.classList.remove('visible');
}

function setLoading(loading) {
  activateBtn.disabled = loading;
  activateBtn.textContent = loading ? 'Attivazione in corso…' : 'Attiva';
}

activateBtn.addEventListener('click', async () => {
  if (!window.noaway || typeof window.noaway.activate !== 'function') {
    showError('Errore di configurazione. Riavvia l\'app.');
    return;
  }
  const email = (emailEl.value || '').trim();
  const licenseKey = (licenseKeyEl.value || '').trim();
  hideError();
  if (!email) {
    showError('Inserisci l\'indirizzo email.');
    return;
  }
  if (!licenseKey) {
    showError('Inserisci la chiave di licenza.');
    return;
  }
  setLoading(true);
  try {
    const result = await window.noaway.activate({ email, licenseKey });
    if (result && result.success) {
      window.noaway.sendActivated();
      return;
    }
    const msg = result.message || (result.error === 'limit_reached'
      ? 'Numero massimo di dispositivi raggiunto per questa licenza.'
      : 'Attivazione non riuscita. Controlla email e chiave.');
    showError(msg);
  } catch (err) {
    showError(err.message || 'Errore di connessione. Riprova più tardi.');
  } finally {
    setLoading(false);
  }
});

// Allow submitting with Enter
licenseKeyEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') activateBtn.click();
});
emailEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') licenseKeyEl.focus();
});
