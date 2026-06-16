const CACHE_NAME = 'vocalwitness-v4';

// Install - Caching
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/VocalWitness/',
                '/VocalWitness/index.html',
                '/VocalWitness/manifest.json',
                '/VocalWitness/js/main.js',
                '/VocalWitness/js/feed.js',
                '/VocalWitness/js/media.js',
                '/VocalWitness/js/auth.js',
                '/VocalWitness/js/engine.js',
                '/VocalWitness/js/utils.js',
                '/VocalWitness/js/i18n.js',
                '/VocalWitness/js/firebase-config.js'
            ]);
        })
    );
});

// 🔥 Fetch handler - Caching + Referrer Fix for Firebase/Google
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // === REFERER FIX FOR GOOGLE IDENTITYTOOLKIT (Main Fix) ===
    if (url.origin === 'https://identitytoolkit.googleapis.com' ||
        url.origin.includes('googleapis.com')) {
        
        console.log('🔧 Fixing referrer for:', url.href);
        
        const modifiedRequest = new Request(event.request, {
            referrer: 'https://vocalwitness-sudo.github.io/',
            referrerPolicy: 'no-referrer-when-downgrade'
        });
        
        event.respondWith(fetch(modifiedRequest));
        return;  // Skip caching for these API calls
    }

    // === Normal Caching Logic (your original code) ===
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => {
                // Offline fallback
                if (event.request.destination === 'document') {
                    return caches.match('/VocalWitness/index.html');
                }
                return new Response('Offline - No internet connection', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            });
        })
    );
});

// Activate
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activated');
    event.waitUntil(clients.claim());   // Important for immediate control
});
