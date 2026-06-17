const CACHE_NAME = 'vocalwitness-v5'; // Increased version

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
    '/VocalWitness/js/firebase-config.js',
    '/VocalWitness/js/sw.js'  // Self-reference
];

// Install Event
self.addEventListener('install', (event) => {
    console.log('🔧 Service Worker installing...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('📦 Caching static assets');
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

// Activate Event - Cleanup old caches
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activated');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('🗑️ Deleting old cache:', cacheName);
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

    // Special handling for Google/Firebase Auth APIs (referrer fix)
    if (url.origin.includes('googleapis.com') || 
        url.origin.includes('identitytoolkit.googleapis.com') ||
        url.origin.includes('firebase')) {
        
        console.log('🔧 Handling Google/Firebase request:', url.href);
        
        const modifiedRequest = new Request(event.request, {
            referrer: 'https://vocalwitness-sudo.github.io/VocalWitness/',
            referrerPolicy: 'no-referrer-when-downgrade',
            mode: 'cors',
            credentials: 'same-origin'
        });

        event.respondWith(fetch(modifiedRequest));
        return;
    }

    // Cache-First strategy for static assets
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                // Cache successful responses
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // Offline fallback
                if (event.request.destination === 'document') {
                    return caches.match('/VocalWitness/index.html');
                }
                if (event.request.destination === 'image') {
                    return caches.match('/VocalWitness/logo.png');
                }
                return new Response('Offline - Please check your connection', { 
                    status: 503, 
                    statusText: 'Service Unavailable' 
                });
            });
        })
    );
});
