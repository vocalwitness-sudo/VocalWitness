// sw.js - Stable Service Worker for VocalWitness (Hardened)
const CACHE_NAME = 'vocalwitness-v11';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/true-witness.html',
    '/forensic-ledger.html',
    '/my-testimonies.html',
    '/manifest.json',
    '/logo.png',
    '/style.css',
    '/sw.js'
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

// Fetch Event - Cache-first with network fallback & multi-page offline routing
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Skip Firebase, Google, external APIs, and non-GET requests
    if (url.origin.includes('firebase') || 
        url.origin.includes('gstatic.com') || 
        url.origin.includes('googleapis.com') ||
        url.origin.includes('paystack') ||
        event.request.method !== 'GET') {
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
            // Offline fallback for HTML document requests
            if (event.request.destination === 'document') {
                return caches.match('/index.html');
            }
            return new Response('Offline resource unavailable', { status: 503, statusText: 'Service Unavailable' });
        })
    );
});
