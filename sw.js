// sw.js - Simplified & Stable Service Worker
const CACHE_NAME = 'vocalwitness-v9';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/logo.png',
    '/style.css',
    '/sw.js',
    '/js/main.js',
    '/js/feed.js',
    '/js/media.js',
    '/js/auth.js',
    '/js/firebase-config.js',
    '/js/engine.js',
    '/js/utils.js',
    '/js/i18n.js'
];

// Install - Cache important files
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker installing...');
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

// Activate - Clean old caches
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activated');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch - Cache-first strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass Firebase & external services
    if (url.origin.includes('firebase') || 
        url.origin.includes('gstatic.com') || 
        url.origin.includes('googleapis.com') ||
        url.origin.includes('paystack')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            return cachedResponse || fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        }).catch(() => {
            // Offline fallback
            if (event.request.destination === 'document') {
                return caches.match('/index.html');
            }
        })
    );
});
