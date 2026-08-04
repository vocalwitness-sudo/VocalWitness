// sw.js - Stable Service Worker for VocalWitness (Hardened & Module-Safe)
const CACHE_NAME = 'vocalwitness-v12';
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

// Install Event - Pre-cache essential static Shell UI
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker installing...');
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
    );
});

// Activate Event - Purge old caches (v11 and prior)
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activated');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cache => {
                    if (cache !== CACHE_NAME) {
                        console.log(`🧹 Purging legacy cache: ${cache}`);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event - Dynamic routing with module bypass logic
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // 1. Skip Firebase, Google SDKs, Paystack, external APIs, and non-GET operations
    if (url.origin.includes('firebase') || 
        url.origin.includes('gstatic.com') || 
        url.origin.includes('googleapis.com') ||
        url.origin.includes('paystack') ||
        event.request.method !== 'GET') {
        return;
    }

    // 2. BYPASS CACHE FOR JS MODULES:
    // Prevents syntax errors caused by caching ES Module scripts (auth.js, main.js, app-state.js, etc.)
    if (url.pathname.endsWith('.js')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // 3. Cache-first strategy for static assets (HTML, CSS, Images, Manifest)
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
            // Offline fallback for HTML navigation requests
            if (event.request.destination === 'document') {
                return caches.match('/index.html');
            }
            return new Response('Offline resource unavailable', { status: 503, statusText: 'Service Unavailable' });
        })
    );
});
