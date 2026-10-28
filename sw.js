// Service worker do Cliente 3D: deixa o app instalável e abre mesmo com internet ruim.
// Estratégia: rede primeiro para a página (sempre a versão nova); cache só como reserva.
const CACHE = 'cliente3d-v26';
const BASICO = ['./', 'icons/icon-192.png', 'icons/icon-512.png', 'icone-venda3d.png'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(BASICO)).catch(() => {})); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // Firebase, fontes, APIs: sempre direto da rede
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const c = r.clone(); caches.open(CACHE).then((x) => x.put('./', c)); return r; }).catch(() => caches.match('./')));
    return;
  }
  e.respondWith(fetch(req).then((r) => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then((x) => x.put(req, c)); } return r; }).catch(() => caches.match(req)));
});
