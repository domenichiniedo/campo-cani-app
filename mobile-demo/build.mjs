// Prepara www/ per la demo Android: l'app esportata per il web in un solo file, il finto
// database della demo e la pagina con il bottone "Demo" per cambiare persona e piano.
// Si lancia dalla cartella mobile-demo con "npm run web"; serve npm ci nella cartella principale.
// Con DEMO_PROVA_GIORNI esce la prova a tempo del piano Pro, tutta sul telefono.
// Con APP_VERA=1 esce invece l'app vera, collegata al database di EXPO_PUBLIC_SUPABASE_URL (Actions → App per
// Android): niente dati di esempio, niente bottone Demo e la chiave delle licenze resta quella del repository.
// La stessa cartella è la demo web per iPhone: con DEMO_BASE_URL=/campo-cani-app funziona anche in
// una sottocartella del sito (GitHub Pages).
import { execSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const out = join(import.meta.dirname, 'export');
const www = join(import.meta.dirname, 'www');

// Chiave pubblica delle licenze di prova della demo (le stesse della demo web): non è quella dei centri veri.
const DEMO_KEY = 'JU1ijvUYPu042LzTpfFZ21ntUwzxiy3KN8_Xycw6Uf0';

const keyFile = join(root, 'src/lib/license-key.ts');
const appJson = join(root, 'app.json');
const real = process.env.APP_VERA === '1';
// DEMO_PROVA_GIORNI=3: la prova del piano Pro, che si blocca 3 giorni dopo la prima apertura.
const days = Number(process.env.DEMO_PROVA_GIORNI || 0);
// Nella demo anche il gestore è finto (demo-backend.js): così si prova la registrazione di un centro nuovo e, tranne
// nella prova del piano Pro, il cambio di piano dalle Impostazioni.
if (!real) process.env.EXPO_PUBLIC_GESTORE_URL = 'https://demo.supabase.co/functions/v1/gestore';
if (!real && !days) process.env.EXPO_PUBLIC_DEMO_CENTRE = 'K9-DEMO00';
const saved = { key: readFileSync(keyFile, 'utf8'), app: readFileSync(appJson, 'utf8') };
try {
  if (!real) writeFileSync(keyFile, saved.key.replace(/LICENSE_PUBLIC_KEY = '[^']*'/, `LICENSE_PUBLIC_KEY = '${DEMO_KEY}'`));
  // Un solo file JavaScript, senza pagine caricate a parte: la WebView lo apre da locale.
  const j = JSON.parse(saved.app);
  j.expo.web = { ...j.expo.web, output: 'single' };
  j.expo.plugins = j.expo.plugins.map((p) =>
    p === 'expo-router' ? ['expo-router', { asyncRoutes: false }] : Array.isArray(p) && p[0] === 'expo-router' ? [p[0], { ...p[1], asyncRoutes: false }] : p,
  );
  if (process.env.DEMO_BASE_URL) j.expo.experiments = { ...j.expo.experiments, baseUrl: process.env.DEMO_BASE_URL };
  writeFileSync(appJson, JSON.stringify(j, null, 2));
  rmSync(out, { recursive: true, force: true });
  execSync(`npx expo export --platform web --output-dir "${out}"`, { cwd: root, stdio: 'inherit' });
} finally {
  writeFileSync(keyFile, saved.key);
  writeFileSync(appJson, saved.app);
}

rmSync(www, { recursive: true, force: true });
mkdirSync(www);
const js = join(out, '_expo/static/js/web');
const entry = readdirSync(js).find((f) => f.startsWith('entry-') && f.endsWith('.js'));
cpSync(join(js, entry), join(www, 'app.js'));
if (existsSync(join(out, 'assets'))) cpSync(join(out, 'assets'), join(www, 'assets'), { recursive: true });
cpSync(join(root, 'assets/images/icon.png'), join(www, 'icon.png'));
// Le pagine pubbliche per Google Play e App Store (informativa privacy e cancellazione dell'account).
for (const f of ['privacy.html', 'cancella-account.html', 'pagina.css']) cpSync(join(import.meta.dirname, f), join(www, f));
if (real) {
  // L'app vera si apre direttamente, senza il finto database.
  let page = readFileSync(join(import.meta.dirname, 'app.html'), 'utf8').replace('<script src="demo-backend.js"></script>\n', '');
  if (process.env.APP_WEB === '1') page = webApp(page, entry);
  writeFileSync(join(www, 'index.html'), page);
  console.log(`App pronta in ${www}`);
  process.exit(0);
}
cpSync(join(root, 'desktop/demo/demo-backend.js'), join(www, 'demo-backend.js'));
cpSync(join(import.meta.dirname, 'app.html'), join(www, 'app.html'));
let page = readFileSync(join(import.meta.dirname, 'index.html'), 'utf8');
if (days) page = page.replace('var TRIAL_DAYS = 0;', `var TRIAL_DAYS = ${days};`).replace('<title>K9 Manager Demo</title>', '<title>K9 Manager Prova</title>');
writeFileSync(join(www, 'index.html'), page);
// Manifest per "Aggiungi alla schermata Home" su iPhone e Android.
cpSync(join(import.meta.dirname, 'manifest.webmanifest'), join(www, 'manifest.webmanifest'));
console.log(`Demo pronta in ${www}`);

// APP_WEB=1 (Actions → Sito web): l'app vera da usare nel browser, installabile come app (PWA) dal telefono e dal
// computer. Indirizzi assoluti (DEMO_BASE_URL), così la stessa pagina fa anche da 404.html di GitHub Pages: chi
// ricarica su /app/qualcosa riapre l'app su quella schermata.
function webApp(page, entry) {
  const base = (process.env.DEMO_BASE_URL ?? '').replace(/\/+$/, '');
  const manifest = {
    name: 'K9 Manager',
    short_name: 'K9 Manager',
    lang: 'it',
    id: `${base}/`,
    start_url: `${base}/`,
    scope: `${base}/`,
    display: 'standalone',
    background_color: '#123a2b',
    theme_color: '#123a2b',
    icons: [{ src: `${base}/icon.png`, sizes: '1024x1024', type: 'image/png', purpose: 'any' }],
  };
  writeFileSync(join(www, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));
  // Ogni versione ha la sua cache: a ogni aggiornamento del sito le pagine vecchie se ne vanno.
  writeFileSync(join(www, 'sw.js'), readFileSync(join(import.meta.dirname, 'sw.js'), 'utf8').replace('k9-web', `k9-web-${entry.replace(/\.js$/, '')}`));
  const head = [
    `<meta name="theme-color" content="#123a2b" />`,
    `<meta name="apple-mobile-web-app-capable" content="yes" />`,
    `<meta name="mobile-web-app-capable" content="yes" />`,
    `<meta name="apple-mobile-web-app-title" content="K9 Manager" />`,
    `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />`,
    `<link rel="icon" href="${base}/icon.png" />`,
    `<link rel="apple-touch-icon" href="${base}/icon.png" />`,
    `<link rel="manifest" href="${base}/manifest.webmanifest" />`,
    `<script>if ('serviceWorker' in navigator) addEventListener('load', function () { navigator.serviceWorker.register('${base}/sw.js', { scope: '${base}/' }).catch(function () {}); });</script>`,
  ].join('\n');
  page = page.replace('<title>K9 Manager</title>', `<title>K9 Manager</title>\n${head}`).replace('<script src="app.js"', `<script src="${base}/app.js"`);
  // Fuori dall'app (un indirizzo sbagliato del sito) la 404 riporta alla pagina principale del sito.
  const guard = `<script>(function () { var p = location.pathname; if (p.indexOf('${base}/') === 0) return; var home = '/' + (p.split('/')[1] || ''); if (home !== '/' && p !== home + '/') location.replace(home + '/'); })();</script>`;
  writeFileSync(join(www, '404.html'), page.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n${guard}`));
  return page;
}
