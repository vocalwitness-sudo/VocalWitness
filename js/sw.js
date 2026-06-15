// sw.js  (Place in ROOT folder)
const CACHE_NAME = 'vocalwitness-v2';

self.addEventListener('install', (event) => {
    console.log('✅ Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll([
                '/',
                '/index.html',
                '/manifest.json',
                '/js/main.js',
                '/js/feed.js',
                '/js/media.js',
                '/js/auth.js',
                '/js/engine.js',
                '/js/utils.js',
                '/js/i18n.js',
                '/js/storage.js',
                // Add more important files here if needed
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).catch(() => {
                if (event.request.destination === 'document') {
                    return caches.match('/index.html');
                }
                return new Response('Offline', { status: 503 });
            });
        })
    );
});
