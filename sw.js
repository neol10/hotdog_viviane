const CACHE_NAME = 'hotdog-viviane-cache-v2';
const ASSETS_TO_CACHE = [
    './',
    '/admin',
    '/comanda',
    './styles.css',
    './comanda.css',
    './script.js',
    './admin.js',
    './comanda.js',
    './manifest.json',
    './img/logo_hotdog_viviane.png',
    './404.html'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                return cache.addAll(ASSETS_TO_CACHE);
            })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Ignora requisições pro Supabase para não ter conflito de cache com dados dinâmicos
    if (event.request.url.includes('supabase.co')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                if (response) {
                    return response;
                }
                return fetch(event.request).catch(() => {
                    // Fallback se estiver offline
                    // Se for navegação de HTML, retorna o index
                    if (event.request.mode === 'navigate') {
                        return caches.match('./');
                    }
                });
            })
    );
});
