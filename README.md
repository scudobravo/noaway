# NoAway

App desktop (Electron) che previene lo status Away su Teams/slack tenendo il display attivo e simulando attività. Include il server licenze usato dall’app per attivazione e validazione.

## Contenuto repo

- **noaway/** – App Electron (macOS/Windows). Build: vedi `noaway/BUILD.md`.
- **license-server/** – API licenze (Node/Express, Stripe, SQLite). L’app punta a `https://license.noaway.app`; per sviluppo puoi usare `NOAWAY_LICENSE_API_URL` e avviare il server in locale.

## Setup rapido

**App desktop (noaway):**
```bash
cd noaway && npm install && npm start
```

**License server (per sviluppo):**
```bash
cd license-server && cp .env.example .env && npm install && npm start
```
Compila `.env` con Stripe, SMTP, ecc. (vedi `.env.example`).

## Licenza

MIT.
