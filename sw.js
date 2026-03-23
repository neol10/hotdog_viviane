const CACHE_NAME = 'hotdog-viviane-cache-v669';
const ASSETS_TO_CACHE = [
    './',
    './styles.css?v=669',
    './script.js?v=669',
    './img/logo_hotdog_viviane.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys.map((key) => {
                if (key !== CACHE_NAME) return caches.delete(key);
            })
        )).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = event.request.url;
    if (url.includes('supabase.co')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                const cloned = response.clone();
                caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// ============================================
// PUSH (GENÉRICO) - funciona com FCM Web Push
// ============================================
self.addEventListener('push', (event) => {
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (e) {
        try {
            payload = { data: { body: event.data ? event.data.text() : '' } };
        } catch {
            payload = {};
        }
    }

    const notif = payload && payload.notification ? payload.notification : {};
    const data = payload && payload.data ? payload.data : {};

    const title = notif.title || data.title || '🌭 Novo Pedido';
    const options = {
        body: notif.body || data.body || 'Chegou um novo pedido no Hotdog Viviane.',
        icon: 'img/logo_hotdog_viviane.png',
        badge: 'img/logo_hotdog_viviane.png',
        vibrate: [200, 100, 200],
        data: {
            url: data.url || data.click_action || '/comanda.html'
        }
    };

    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/comanda.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes(targetUrl) && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
            return null;
        })
    );
});
