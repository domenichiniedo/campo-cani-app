// Solo per la versione demo: aggiunge il finto database con i dati di esempio alla versione web.
// Uso: node demo/inject.js (dopo "npm run web" con EXPO_PUBLIC_SUPABASE_URL=https://demo.supabase.co).
const fs = require('node:fs');
const path = require('node:path');

const web = path.join(__dirname, '..', 'web');
for (const f of ['demo-backend.js', 'demo-start.js']) fs.copyFileSync(path.join(__dirname, f), path.join(web, f));
const index = path.join(web, 'index.html');
const html = fs.readFileSync(index, 'utf8');
if (!html.includes('demo-backend.js')) {
  fs.writeFileSync(index, html.replace('<head>', '<head><script src="/demo-backend.js"></script><script src="/demo-start.js"></script>'));
}
console.log('Demo aggiunta a', index);
