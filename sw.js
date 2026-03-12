const CACHE_NAME = 'hotdog-viviane-cache-v666';
const ASSETS_TO_CACHE = [
    './',
    './styles.css?v=666',
    './script.js?v=666',
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
