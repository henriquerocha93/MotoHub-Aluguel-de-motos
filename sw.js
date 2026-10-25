const CACHE_NAME = 'facilitamoto-pwa-v20261025-01';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './crm.html',
  './oficina.html',
  './style.css',
  './app.js',
  './favicon.png',
  './favicon.ico',
  './icon-192.png',
  './icon-512.png',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch((err) => {
        console.warn('PWA assets cache warning:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Ignora chamadas cross-origin, firestore e APIs externas
  if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Network-first com atualização automática do cache local
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(event.request);
      })
  );
});

// ============================================================
// RECEBIMENTO DE PUSH NOTIFICATIONS (MOBILE PWA + DESKTOP)
// ============================================================
self.addEventListener('push', (event) => {
  console.log('[SW Push] Evento push recebido:', event);

  let data = {
    title: '🔔 FACILITA MOTO CRM',
    body: 'Nova notificação do sistema',
    icon: './icon-192.png',
    badge: './favicon.png',
    url: './crm.html',
    tag: 'facilitamoto-alert-' + Date.now()
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = Object.assign(data, parsed);
    } catch (e) {
      data.body = event.data.text() || data.body;
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || './icon-192.png',
    badge: data.badge || './favicon.png',
    vibrate: data.vibrate || [300, 100, 300, 100, 400],
    tag: data.tag || 'facilita-alerta',
    renotify: true,
    requireInteraction: true,
    data: {
      url: data.url || './crm.html',
      recebidoEm: Date.now()
    },
    actions: [
      { action: 'open', title: '🚀 Abrir Sistema' },
      { action: 'close', title: '✕ Fechar' }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ============================================================
// CLIQUE NA NOTIFICAÇÃO PUSH (MOBILE + DESKTOP)
// ============================================================
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : './crm.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && client.url.includes('crm.html') && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
