/**
 * Genera icone app e tray da assets/logo.svg.
 * - icon.png (1024) e, se disponibile icon-gen, icon.icns / icon.ico
 * - trayTemplate.png e trayTemplate@2x.png per la menu bar macOS
 *
 * Dipendenze: @resvg/resvg-js (obbligatorio), icon-gen (opzionale, per .icns/.ico)
 * Uso: node scripts/build-icons.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const LOGO_SVG = path.join(ASSETS, 'logo.svg');

if (!fs.existsSync(LOGO_SVG)) {
  console.error('Manca assets/logo.svg. Copia il logo in noaway/assets/logo.svg');
  process.exit(1);
}

async function main() {
  const { Resvg } = require('@resvg/resvg-js');
  const svg = fs.readFileSync(LOGO_SVG);

  // 1) Icona app: 1024x1024 (electron-builder su Mac accetta PNG; Windows userà .ico se presente)
  const icon1024 = path.join(ASSETS, 'icon.png');
  const resvgIcon = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 } });
  fs.writeFileSync(icon1024, resvgIcon.render().asPng());
  console.log('Scritto assets/icon.png (1024x1024)');

  // 2) Tray / menu bar: 22 e 44 (Retina)
  const traySizes = [
    [22, path.join(ASSETS, 'trayTemplate.png')],
    [44, path.join(ASSETS, 'trayTemplate@2x.png')],
  ];
  for (const [size, outPath] of traySizes) {
    const resvgTray = new Resvg(svg, { fitTo: { mode: 'width', value: size } });
    fs.writeFileSync(outPath, resvgTray.render().asPng());
    console.log('Scritto', path.basename(outPath));
  }

  // 3) Opzionale: icon.icns e icon.ico con icon-gen (migliore per build finale)
  try {
    const icongen = require('icon-gen');
    await icongen(LOGO_SVG, ASSETS, {
      report: false,
      ico: { name: 'icon', sizes: [16, 24, 32, 48, 64, 128, 256] },
      icns: { name: 'icon', sizes: [16, 32, 64, 128, 256, 512, 1024] },
    });
    console.log('Generati assets/icon.icns e assets/icon.ico');
  } catch (e) {
    console.log('(icon-gen non usato:', e.message, '- usa assets/icon.png per il build Mac)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
