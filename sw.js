// Aumente este número só se quiser forçar limpeza do cache antigo.
const CACHE = 'tiatay-v9';
const ARQUIVOS = ['./', './index.html', './style.css', './App.js', './firebase-config.js', './manifest.json',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', e => {
  // guarda arquivo por arquivo: se um faltar, a instalação do app não quebra
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(ARQUIVOS.map(a => c.add(a)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Rede primeiro: se você atualizar o site no GitHub, o app já mostra a versão nova.
// Sem internet, usa a cópia guardada.
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || !req.url.startsWith(self.location.origin)) return;
  e.respondWith(
    fetch(req).then(res => {
      const copia = res.clone();
      caches.open(CACHE).then(c => c.put(req, copia));
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
  );
});