importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.5/firebase-messaging-compat.js');

firebase.initializeApp({
    apiKey: "AIzaSyBDFLMd9nWbBcUVssT4CIEuFxQCzACDUgI",
    authDomain: "hotdogviviane.firebaseapp.com",
    projectId: "hotdogviviane",
    storageBucket: "hotdogviviane.firebasestorage.app",
    messagingSenderId: "1064167764931",
    appId: "1:1064167764931:web:c33d93a61598f22074c376",
    measurementId: "G-XHHY8FVFZ3"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    const notif = payload && payload.notification ? payload.notification : {};
    const title = notif.title || 'Novo pedido';
    const options = {
        body: notif.body || 'Chegou um novo pedido na comanda.',
        icon: 'img/logo_hotdog_viviane.png',
        badge: 'img/logo_hotdog_viviane.png',
        data: {
            url: '/comanda.html'
        }
    };

    self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url) || '/comanda.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('/comanda.html') && 'focus' in client) {
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
