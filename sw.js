const CACHE_NAME = 'vocalwitness-v6'; // Incremented version to force cache refresh

const STATIC_ASSETS = [
    '/VocalWitness/',
    '/VocalWitness/index.html',
    '/VocalWitness/manifest.json',
    '/VocalWitness/style.css',
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

// Install Event
self.addEventListener('install', (event) => {
    self.skipWaiting(); // Force the new service worker to activate immediately
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

// Activate Event - Cleanup old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => clients.claim())
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. NETWORK BYPASS: Do not intercept Firebase/Google services
    if (url.origin.includes('googleapis.com') || 
        url.origin.includes('gstatic.com') ||
        url.origin.includes('firebase')) {
        return; 
    }

    // 2. CACHE-FIRST for static assets
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            return cachedResponse || fetch(event.request).then((networkResponse) => {
                // Only cache successful requests
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
