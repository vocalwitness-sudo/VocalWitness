// sw.js - Stable Service Worker for VocalWitness
const CACHE_NAME = 'vocalwitness-v10';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/logo.png',
    '/style.css',
    '/sw.js'
    // Add more critical files if needed
];

// Install Event
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker installing...');
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
});

// Activate Event - Clean old caches
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activated');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) return caches.delete(cache);
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event - Cache-first with network fallback
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip Firebase, Google, external APIs
    if (url.origin.includes('firebase') || 
        url.origin.includes('gstatic.com') || 
        url.origin.includes('googleapis.com') ||
        url.origin.includes('paystack')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(cachedResponse => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then(networkResponse => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        }).catch(() => {
            // Offline fallback for HTML pages
            if (event.request.destination === 'document') {
                return caches.match('/index.html');
            }
            return new Response('Offline', { status: 503 });
        })
    );
});
