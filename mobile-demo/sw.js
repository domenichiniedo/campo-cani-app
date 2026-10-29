// Service worker della web app (Actions → Sito web): la rende installabile e la apre anche senza rete.
// Prima la rete, così si vede sempre l'ultima versione; la copia salvata serve solo se la rete non c'è.
// I dati del centro (Supabase, su un altro indirizzo) non passano di qui.
const CACHE = 'k9-web';

// L'app intera è in pochi file: si salvano subito, così si apre senza rete anche la prima volta dopo l'installazione.
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', 'app.js', 'manifest.webmanifest', 'icon.png'])));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('k9-web') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match(self.registration.scope) : undefined)).then((r) => r || Response.error())),
  );
});
