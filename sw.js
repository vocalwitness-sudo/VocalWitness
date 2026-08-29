// sw.js - Production Service Worker for VocalWitness (v14)
// Features: Dynamic Asset Caching, PWA Web Share Target, Offline Evidence Queue, Background Sync & Panic Purge

const CACHE_NAME = 'vocalwitness-v14';
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

// --- IndexedDB Offline Evidence Helpers ---
const IDB_NAME = 'VocalWitnessOffline';
const IDB_STORE = 'pending_evidence';

function openOfflineDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(IDB_NAME, 1);
        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(IDB_STORE)) {
                db.createObjectStore(IDB_STORE, { keyPath: 'id', autoIncrement: true });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getPendingEvidenceQueue() {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function removeEvidenceFromQueue(id) {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}

// 1. Install Event: Pre-cache core application shell
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker installing (v14)...');
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

// 2. Activate Event: Clean up legacy caches & claim clients immediately
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activated (v14)');
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

    // --- C. JavaScript Modules Strategy (Network-First with Cache Fallback) ---
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
                const cachedResponse = await caches.match(event.request);
                if (cachedResponse) {
                    return cachedResponse;
                }
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
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        }).catch(() => {
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

// 4. Background Sync Listener for Retrying Queue
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-testimonies') {
        event.waitUntil(flushPendingEvidenceQueue());
    }
});

/**
 * Flush all offline queued evidence items to Firestore / Storage backend
 */
async function flushPendingEvidenceQueue() {
    const pendingItems = await getPendingEvidenceQueue();
    if (!pendingItems || pendingItems.length === 0) return;

    for (const item of pendingItems) {
        try {
            const response = await fetch('/api/v1/posts/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item.payload)
            });

            if (response.ok) {
                await removeEvidenceFromQueue(item.id);
                await notifyClientsSyncComplete(item.id);
            }
        } catch (err) {
            console.error('[ServiceWorker] Retrying queue failed for item:', item.id, err);
            throw err; // Informs the browser sync manager to schedule a retry
        }
    }
}

/**
 * Notify open client tabs to update UI state
 */
async function notifyClientsSyncComplete(itemId) {
    const clientsList = await self.clients.matchAll({ type: 'window' });
    for (const client of clientsList) {
        client.postMessage({
            type: 'OFFLINE_SYNC_COMPLETE',
            itemId: itemId
        });
    }
}

// 5. Emergency Panic Listener: Instant wipe of local runtime state
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
