const CACHE_NAME = 'vocalwitness-v4';

// Install
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

// 🔥 Main Fix: Referrer for Google/Firebase
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (url.origin === 'https://identitytoolkit.googleapis.com' || 
        url.origin.includes('googleapis.com')) {
        
        console.log('🔧 Fixing referrer for Google API:', url.href);
        
        const modifiedRequest = new Request(event.request, {
            referrer: 'https://vocalwitness-sudo.github.io/VocalWitness/',
            referrerPolicy: 'no-referrer-when-downgrade'
        });
        
        event.respondWith(fetch(modifiedRequest));
        return;
    }

    // Original caching logic
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => {
                if (event.request.destination === 'document') {
                    return caches.match('/VocalWitness/index.html');
                }
                return new Response('Offline', { status: 503 });
            });
        })
    );
});

// Activate
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activated');
    event.waitUntil(clients.claim());
});
