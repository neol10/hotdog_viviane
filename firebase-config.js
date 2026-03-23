(function () {
    window.firebaseWebConfig = {
        apiKey: "AIzaSyBDFLMd9nWbBcUVssT4CIEuFxQCzACDUgI",
        authDomain: "hotdogviviane.firebaseapp.com",
        projectId: "hotdogviviane",
        storageBucket: "hotdogviviane.firebasestorage.app",
        messagingSenderId: "1064167764931",
        appId: "1:1064167764931:web:c33d93a61598f22074c376",
        measurementId: "G-XHHY8FVFZ3"
    };

    const defaultVapidKey = "BCF__lOPmGXH7D2-EsZxAHHQJxDZWVvkcXHke4nRfNus_P5dmdLsClPYbZStLF656s60Fsbm1weCAZVB8OGzKMs";
    let overrideVapidKey = null;
    try {
        overrideVapidKey = localStorage.getItem('hotdog_firebase_vapid');
    } catch (e) {
        overrideVapidKey = null;
    }

    window.firebasePublicVapidKey = (overrideVapidKey && overrideVapidKey.trim()) ? overrideVapidKey.trim() : defaultVapidKey;

    function decodeBase64UrlToBytes(base64Url) {
        if (!base64Url || typeof base64Url !== 'string') return null;
        const normalized = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const padLength = (4 - (normalized.length % 4)) % 4;
        const padded = normalized + '='.repeat(padLength);
        const raw = atob(padded);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
        return bytes;
    }

    window.validateFirebaseVapidKey = function (vapidKey) {
        const key = vapidKey || window.firebasePublicVapidKey;
        try {
            const bytes = decodeBase64UrlToBytes(key);
            const ok = !!bytes && bytes.length === 65;
            if (!ok) {
                console.warn('[firebase-config] VAPID key inválida. Esperado 65 bytes, obtido:', bytes ? bytes.length : null);
            }
            return ok;
        } catch (e) {
            console.warn('[firebase-config] Falha ao validar VAPID key:', e);
            return false;
        }
    };

    // Aviso imediato no console (não bloqueia a página)
    window.validateFirebaseVapidKey();
})();
