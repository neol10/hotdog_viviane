const CACHE_NAME = 'hotdog-viviane-cache-v677';
const ASSETS_TO_CACHE = [
    './',
    './styles.css?v=677',
    './script.js?v=677',
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
    if (event.request.method !== 'GET') return;
    if (url.includes('supabase.co')) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Só cacheia respostas ok e do mesmo origin (evita cachear opaque/externos)
                try {
                    const reqUrl = new URL(event.request.url);
                    if (response && response.ok && reqUrl.origin === self.location.origin) {
                        const cloned = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, cloned));
                    }
                } catch (e) {
                    // ignora problemas de cache; nunca deve quebrar a navegação
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});

// ============================================
// PUSH (GENÉRICO) - funciona com FCM Web Push
// (não depende de importScripts externos; evita falha de update do SW)
// ============================================
self.addEventListener('push', (event) => {
    console.log('[SW] Evento Push recebido.');
    
    let payload = {};
    try {
        payload = event.data ? event.data.json() : {};
    } catch (e) {
        console.warn('[SW] Falha ao parsear JSON do push:', e);
        try {
            payload = { data: { body: event.data ? event.data.text() : '' } };
        } catch {
            payload = {};
        }
    }

    console.log('[SW] Payload processado:', payload);

    // Estrutura FCM v1: pode vir em payload.notification ou payload.data
    // Também tratamos se vier dentro de payload.message (raro mas possível em alguns envios manuais)
    const msg = payload.message || payload;
    const notif = msg.notification || {};
    const data = msg.data || {};

    const title = notif.title || data.title || '🌭 Novo Pedido';
    const body = notif.body || data.body || 'Chegou um novo pedido no Hotdog Viviane.';
    
    const clickUrl =
        data.url ||
        data.click_action ||
        (msg.fcmOptions && msg.fcmOptions.link) ||
        (msg.fcm_options && msg.fcm_options.link) ||
        notif.click_action ||
        '/comanda.html';

    // Para ícones, o Android prefere caminhos que ele consiga resolver. 
    // Se o SW está na raiz, 'img/...' funciona, mas vamos garantir o origin.
    const icon = self.location.origin + '/img/logo_hotdog_viviane.png';

    const options = {
        body: body,
        icon: icon,
        badge: icon,
        vibrate: [200, 100, 200],
        tag: 'hotdog-viviane-push', // Evita múltiplas notificações iguais acumuladas
        renotify: true,
        data: {
            url: clickUrl
        }
    };

    // event.waitUntil garante que o Service Worker não morra antes de mostrar a notificação
    event.waitUntil(
        self.registration.showNotification(title, options)
            .then(() => console.log('[SW] Notificação exibida com sucesso.'))
            .catch(err => console.error('[SW] Erro ao mostrar notificação:', err))
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Clique na notificação detectado.');
    event.notification.close();

    const urlToOpen = (event.notification.data && event.notification.data.url) || '/comanda.html';
    const absoluteUrlToOpen = new URL(urlToOpen, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({
            type: 'window',
            includeUncontrolled: true
        }).then((windowClients) => {
            // Se já houver uma aba aberta no destino, foca nela
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client && typeof client.url === 'string' && client.url.includes(absoluteUrlToOpen) && 'focus' in client) {
                    return client.focus();
                }
            }

            // Caso contrário, abre uma nova aba na URL alvo
            if (clients.openWindow) {
                return clients.openWindow(absoluteUrlToOpen);
            }
        })
    );
});
