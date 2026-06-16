// js/sw.js
const CACHE_NAME = 'vocalwitness-v4';

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

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Return cached version or fetch from network
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

self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activated');
});
