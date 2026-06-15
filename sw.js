// sw.js   ← Put this in ROOT
const CACHE_NAME = 'vocalwitness-v3';

self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll([
                '/VocalWitness/',
                '/VocalWitness/index.html',
                '/VocalWitness/js/main.js',
                '/VocalWitness/js/feed.js',
                '/VocalWitness/js/media.js',
                '/VocalWitness/js/auth.js',
                '/VocalWitness/js/engine.js',
                '/VocalWitness/js/utils.js',
                '/VocalWitness/js/i18n.js'
            ]);
        })
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request);
        }).catch(() => {
            if (event.request.destination === 'document') {
                return caches.match('/VocalWitness/index.html');
            }
        })
    );
});
