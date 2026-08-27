// sw.js - Hardened Service Worker for VocalWitness (v13)
const CACHE_NAME = 'vocalwitness-v13';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/true-witness.html',
    '/forensic-ledger.html',
    '/my-testimonies.html',
    '/manifest.json',
    '/logo.png',
    '/style.css'
];

// 1. Install Event: Pre-cache core application shell
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker installing (v13)...');
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

// 2. Activate Event: Clean up legacy caches & claim clients immediately
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activated');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log(`🧹 Purging legacy cache: ${cache}`);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. Fetch Event Routing Strategy
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // --- A. Handle PWA Web Share Target Intercept ---
    if (url.pathname.endsWith('/index.html') && url.searchParams.has('share')) {
        event.respondWith((async () => {
            if (event.request.method === 'POST') {
                try {
                    const formData = await event.request.formData();
                    const mediaFile = formData.get('media');

                    if (mediaFile && mediaFile.size > 0) {
                        const cache = await caches.open(CACHE_NAME);
                        await cache.put('/shared-media-payload', new Response(mediaFile));
                    }
                } catch (err) {
                    console.error('Failed to intercept shared payload:', err);
                }
            }
            return (await caches.match('/index.html')) || fetch(event.request);
        })());
        return;
    }

    // --- B. External APIs, Firebase SDKs, Payment Gateways & Non-GET Bypass ---
    if (
        url.origin.includes('firebase') ||
        url.origin.includes('gstatic.com') ||
        url.origin.includes('googleapis.com') ||
        url.origin.includes('paystack') ||
        event.request.method !== 'GET'
    ) {
        return; // Handled directly by browser default network engine
    }

    // --- C. JavaScript Modules Strategy (Network-First with Cache Stale-While-Revalidate Fallback) ---
    if (url.pathname.endsWith('.js')) {
        event.respondWith((async () => {
            try {
                const networkResponse = await fetch(event.request);
                if (networkResponse && networkResponse.status === 200) {
                    const cache = await caches.open(CACHE_NAME);
                    cache.put(event.request, networkResponse.clone());
                }
                return networkResponse;
            } catch (error) {
                // If offline or network fails, retrieve cached JS module
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }
                // Fallback minimal response preventing unhandled module execution crash
                return new Response('console.warn("Offline: Module unavailable from network and cache.");', {
                    headers: { 'Content-Type': 'application/javascript' }
                });
            }
        })());
        return;
    }

    // --- D. Static Shell Strategy (Cache-First, Fallback to Network) ---
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;

            return fetch(event.request).then((networkResponse) => {
                // Cache valid 200 responses dynamically
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        }).catch(() => {
            // Offline UI fallback for main page navigation requests
            if (event.request.destination === 'document') {
                return caches.match('/index.html');
            }
            return new Response('Offline resource unavailable', {
                status: 503,
                statusText: 'Service Unavailable'
            });
        })
    );
});

// 4. Emergency Panic Listener: Instant wipe of local runtime state
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'VW_PANIC_CLEAR_CACHES') {
        event.waitUntil(
            caches.keys().then((names) =>
                Promise.all(names.map((name) => caches.delete(name)))
            ).then(() => {
                console.log('🚨 Panic: All client caches wiped');
            })
        );
    }
});
