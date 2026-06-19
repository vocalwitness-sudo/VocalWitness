importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

const { BackgroundSyncPlugin } = workbox.backgroundSync;
const { registerRoute } = workbox.routing;
const { NetworkOnly } = workbox.strategies;

const CACHE_NAME = 'vocalwitness-v8';

// Background Sync for testimony submission
const bgSyncPlugin = new BackgroundSyncPlugin('vocalwitness-queue', {
    maxRetentionTime: 24 * 60 // 24 hours
});

// Register background sync for API calls
registerRoute(
    ({ url }) => url.pathname.includes('/api/submit-testimony'),
    new NetworkOnly({
        plugins: [bgSyncPlugin]
    }),
    'POST'
);

// Correct paths for GitHub Pages (project site)
const STATIC_ASSETS = [
    './',                    // Important: root of the site
    './index.html',
    './manifest.json',
    './logo.png',
    './VW.peg',              // updated filename
    './style.css',
    './sw.js',
    './vocalWitnessEngine.js',
    
    // JS files
    './js/main.js',
    './js/feed.js',
    './js/media.js',
    './js/auth.js',
    './js/engine.js',
    './js/utils.js',
    './js/i18n.js',
    './js/firebase-config.js'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('✅ Caching static assets...');
            return cache.addAll(STATIC_ASSETS);
        }).catch(err => console.error('❌ Cache addAll failed:', err))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑 Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass external services (Firebase, Google, etc.)
    if (url.origin.includes('googleapis.com') ||
        url.origin.includes('gstatic.com') ||
        url.origin.includes('firebase') ||
        url.origin.includes('firestore')) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            // Return cache if available
            if (cachedResponse) return cachedResponse;

            // Otherwise try network
            return fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Optional: return offline fallback (e.g. offline.html)
                if (event.request.destination === 'document') {
                    return caches.match('./index.html');
                }
            });
        })
    );
});
