# Build NoAway

## Pulizia output

Prima di una build pulita, svuota la cartella `dist`:

```bash
rm -rf dist/*
```

## macOS

Un solo .dmg universal (Intel + Apple Silicon):

```bash
npm run build:mac
```

Output in `dist/` (es. `NoAway-1.0.0.dmg`).

## Windows

**La build Windows va eseguita su una macchina Windows** (o in CI con runner Windows).

Su macOS, `npm run build:win` fallisce perché `robotjs` non fornisce prebuild per Electron 28 su win32 e non è possibile compilare moduli nativi per Windows da macOS.

- **Su Windows:** installa [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools) o Visual Studio Build Tools, poi:
  ```bash
  npm install
  npm run build:win
  ```
  Output in `dist/` (installer NSIS e/o portable).

- **Da macOS/Linux:** usa GitHub Actions (vedi `.github/workflows/build-windows.yml`) per buildare su un runner Windows e scaricare gli artefatti.
