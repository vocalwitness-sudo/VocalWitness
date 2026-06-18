// js/sw.js
const CACHE_NAME = 'vocalwitness-v7'; // Increased version

const STATIC_ASSETS = [
    '/VocalWitness/',
    '/VocalWitness/index.html',
    '/VocalWitness/manifest.json',
    '/VocalWitness/logo.png',
    '/VocalWitness/VW.jpeg',
    '/VocalWitness/js/main.js',
    '/VocalWitness/js/feed.js',
    '/VocalWitness/js/media.js',
    '/VocalWitness/js/auth.js',
    '/VocalWitness/js/engine.js',
    '/VocalWitness/js/utils.js',
    '/VocalWitness/js/i18n.js',
    '/VocalWitness/js/firebase-config.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass Firebase/Google APIs
    if (url.origin.includes('googleapis.com') ||
        url.origin.includes('gstatic.com') ||
        url.origin.includes('firebase')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            });
        })
    );
});
