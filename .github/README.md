# GitHub Actions – Build NoAway

## Cosa serve

- **Niente di particolare.** I workflow usano solo `actions/checkout`, `actions/setup-node` e `actions/upload-artifact`; non servono segreti né variabili d’ambiente.

- **Repo su GitHub** con i workflow in `.github/workflows/` (root del repo). Dopo il push, le Actions sono già disponibili.

## Come usare

1. Vai su **https://github.com/scudobravo/noaway/actions**
2. Scegli il workflow:
   - **Build Windows** → genera gli `.exe` (installer NSIS + portable)
   - **Build Mac** → genera il `.dmg` universal (Intel + Apple Silicon)
3. Clicca **Run workflow** → **Run workflow** (branch `main`)
4. Attendi la fine del run (Windows ~5–10 min, Mac ~10–15 min)
5. Nella pagina del run completato, in **Artifacts** scarica:
   - `noaway-windows` (file .exe)
   - `noaway-mac` (file .dmg)

## Workflow disponibili

| Workflow      | Runner        | Trigger        | Artefatti        |
|---------------|---------------|----------------|------------------|
| Build Windows | windows-latest| Manuale        | noaway-windows   |
| Build Mac     | macos-latest  | Manuale        | noaway-mac       |

Entrambi usano **workflow_dispatch**: partono solo quando li avvii tu da Actions.
