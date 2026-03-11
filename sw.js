const CACHE_NAME = 'hotdog-viviane-cache-v3';
const ASSETS_TO_CACHE = [
    './',
    './admin.html',
    './comanda.html',
    './styles.css',
    './admin.css',
    './comanda.css',
    './script.js',
    './admin.js',
    './comanda.js',
    './manifest.json',
    './img/logo_hotdog_viviane.png'
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
    const url = event.request.url;

    // Ignora Supabase e extensões de navegador
    if (url.includes('supabase.co') || url.includes('chrome-extension')) {
        return;
    }

    // Estratégia Network-First para arquivos de lógica (HTML, JS, CSS)
    // Isso garante que mudanças no Admin apareçam na hora
    if (event.request.mode === 'navigate' || url.endsWith('.js') || url.endsWith('.css') || url.endsWith('.html')) {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    const clonedResponse = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clonedResponse);
                    });
                    return response;
                })
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache-First para imagens e outros assets estáticos
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                return response || fetch(event.request);
            })
    );
});
