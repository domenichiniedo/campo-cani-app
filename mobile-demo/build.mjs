// Prepara www/ per la demo Android: l'app esportata per il web in un solo file, il finto
// database della demo e la pagina con il bottone "Demo" per cambiare persona e piano.
// Si lancia dalla cartella mobile-demo con "npm run web"; serve npm ci nella cartella principale.
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
const saved = { key: readFileSync(keyFile, 'utf8'), app: readFileSync(appJson, 'utf8') };
try {
  writeFileSync(keyFile, saved.key.replace(/LICENSE_PUBLIC_KEY = '[^']*'/, `LICENSE_PUBLIC_KEY = '${DEMO_KEY}'`));
  // Un solo file JavaScript, senza pagine caricate a parte: la WebView lo apre da locale.
  const j = JSON.parse(saved.app);
  j.expo.web = { ...j.expo.web, output: 'single' };
  j.expo.plugins = j.expo.plugins.map((p) =>
    p === 'expo-router' ? ['expo-router', { asyncRoutes: false }] : Array.isArray(p) && p[0] === 'expo-router' ? [p[0], { ...p[1], asyncRoutes: false }] : p,
  );
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
cpSync(join(root, 'desktop/demo/demo-backend.js'), join(www, 'demo-backend.js'));
cpSync(join(import.meta.dirname, 'app.html'), join(www, 'app.html'));
cpSync(join(import.meta.dirname, 'index.html'), join(www, 'index.html'));
console.log(`Demo pronta in ${www}`);
