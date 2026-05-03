// AeroDeck — Service Worker
// Stratégie : network-first pour le HTML (toujours essayer de récupérer
// la dernière version en ligne), cache-first pour les assets externes
// (CDN React, Tailwind, Tesseract, jsPDF) qui ne changent pas.
//
// IMPORTANT : à chaque release importante, incrémente CACHE_NAME ci-dessous
// pour forcer la suppression de l'ancien cache.

const CACHE_NAME = 'aerodeck-v1';
const HTML_PATH = '/aerodeck/FlightOps.html';

// === Installation : skip waiting pour activer immédiatement ===
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// === Activation : nettoyage des anciens caches + claim des clients ===
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Supprime les caches d'anciennes versions
      caches.keys().then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      ),
      // Prend le contrôle de toutes les pages déjà ouvertes
      self.clients.claim(),
    ])
  );
});

// === Fetch : stratégies différentes selon le type de ressource ===
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1) Le HTML principal : NETWORK-FIRST
  //    On essaie toujours d'aller chercher la dernière version sur GitHub Pages.
  //    Si offline, on retombe sur le cache.
  const isMainHTML =
    url.pathname.endsWith('FlightOps.html') ||
    url.pathname === '/aerodeck/' ||
    url.pathname === '/aerodeck';

  if (isMainHTML) {
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .then((response) => {
          // Met à jour le cache avec la nouvelle version
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 2) Assets CDN (cdnjs, unpkg, cdn.tailwindcss…) : CACHE-FIRST
  //    Les versions sont figées dans les URLs (ex: react@18.2.0/...) donc
  //    on peut les mettre en cache durablement.
  if (
    url.hostname === 'cdnjs.cloudflare.com' ||
    url.hostname === 'unpkg.com' ||
    url.hostname === 'cdn.tailwindcss.com' ||
    url.hostname === 'cdn.jsdelivr.net'
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          // Cache uniquement les réponses 200 OK
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // 3) Tout le reste : laisse passer normalement
});

// === Communication avec la page ===
self.addEventListener('message', (event) => {
  if (!event.data) return;
  // Force un check de mise à jour (déclenché à chaque ouverture par la page)
  if (event.data.type === 'CHECK_UPDATE') {
    self.registration.update();
  }
  // L'utilisateur a cliqué sur "Recharger" dans la bannière de mise à jour
  // → on prend le contrôle immédiatement, ce qui déclenche un controllerchange
  // côté page, qui à son tour recharge l'onglet.
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
