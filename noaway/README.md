# NoAway

**NoAway** è un’applicazione Electron che impedisce al computer di andare in idle: mantiene il display sveglio e simula input da tastiera a intervalli casuali, così da evitare lo status *Away* (es. in Teams). Esegue in system tray senza finestra visibile, con uso minimo di risorse.

## Requisiti

- Node.js 18+
- npm

## Albero completo del progetto

```
noaway/
├── package.json
├── main.js
├── activityEngine.js
├── scheduler.js
├── idleMonitor.js
├── tray.js
├── settings.js
├── logger.js
├── preload.js
├── README.md
├── electron-builder.yml   # Configurazione build (DMG, NSIS, portable)
├── .gitignore
├── assets/
│   └── trayTemplate.png   # Icona tray (npm run create-icon per rigenerare)
├── scripts/
│   └── create-tray-icon.js
└── (logs/ in userData a runtime)
```

## Installazione

```bash
cd noaway   # oppure la cartella del progetto
npm install
```

Se `robotjs` fallisce la compilazione (comune su Electron recenti), eseguire:

```bash
npm run rebuild
```

## Avvio

```bash
npm start
```

All’avvio: caricamento impostazioni, creazione tray, avvio del motore di attività se `activityEnabled` è true. Nessuna finestra; l’app resta nella system tray.

## Build

- **Windows**: NSIS + portable EXE  
  `npm run build:win`

- **macOS**: DMG (x64 + arm64)  
  `npm run build:mac`

- **Tutti**  
  `npm run build` oppure `npm run build:all`

Gli artefatti sono in `dist/`.

La configurazione di build è in `electron-builder.yml` (per evitare conflitti con il parser di Node.js sul `package.json`).  
Per macOS è necessario fornire `assets/icon.icns`; per Windows `assets/icon.ico` (opzionale, altrimenti icona predefinita Electron).

## Funzionalità principali

1. **Power management**  
   `powerSaveBlocker.start('prevent-display-sleep')` quando il motore è ACTIVE; stop quando è in PAUSE. Nessun doppio blocker.

2. **Idle monitor**  
   Controllo ogni 30 secondi con `powerMonitor.getSystemIdleTime()`.  
   - Idle &lt; 60 s: nessuna azione.  
   - Idle &gt; soglia (default 240 s): viene attivata la simulazione di attività.

3. **Simulazione attività**  
   Tasto simulato: **SHIFT** (robotjs). Intervallo base ~5 min con jitter ±90 s (circa 3–7 min), con probabilità di saltare un intervallo per evitare pattern fissi.

4. **Activity engine**  
   Stati: `ACTIVE`, `PAUSED`.  
   Metodi: `start()`, `stop()`, `restart()`, `getStatus()`.  
   Gestisce power blocker, scheduler e idle monitor.

5. **Tray**  
   Menu: Stato (Active/Paused), Toggle Keep Active, Restart Activity Engine, Start at Login, Open Logs, Quit. Icona e menu aggiornati al cambio stato.

6. **Impostazioni (electron-store)**  
   `autoStart`, `activityEnabled`, `idleThreshold`.

7. **Log**  
   File: `userData/logs/noaway.log`. Rotazione oltre 5MB. Timestamp, tipo evento, cambi di stato, errori.

8. **Single instance**  
   `app.requestSingleInstanceLock()`. Seconda istanza non apre nuova finestra (app tray-only).

9. **Avvio al login**  
   `app.setLoginItemSettings({ openAtLogin })` su macOS e Windows.

## Prestazioni

- Architettura event-driven (timer, callback, nessun busy loop).
- CPU e memoria ridotti; polling solo ogni 30 s per idle e intervalli lunghi per la simulazione.

## Licenza

MIT
