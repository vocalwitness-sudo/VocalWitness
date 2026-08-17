// js/share-target.js - Handles incoming PWA Share Target payloads from mobile galleries
import { showToast } from './utils.js';

export async function handleSharedContent() {
    const params = new URLSearchParams(window.location.search);
    
    if (!params.has('share')) return;

    const sharedTitle = params.get('title') || '';
    const sharedText = params.get('text') || '';
    const sharedUrl = params.get('url') || '';

    console.slog?.("📥 Incoming shared payload detected from mobile OS");

    // Clean up URL parameters immediately to prevent duplicate triggers on reload
    if (window.history && window.history.replaceState) {
        const cleanUrl = window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);
    }

    // Check if the Service Worker caught and cached shared files via Cache API / IndexedDB
    try {
        const cache = await caches.open('vocalwitness-v12');
        const matchedRequest = await cache.match('/shared-media-payload');
        
        if (matchedRequest) {
            const blob = await matchedRequest.blob();
            await cache.delete('/shared-media-payload'); // Consume it
            
            // Dispatch custom event for feed.js or composer.js to pick up the media
            window.dispatchEvent(new CustomEvent('vocalWitness:sharedMediaReady', {
                detail: {
                    text: [sharedTitle, sharedText, sharedUrl].filter(Boolean).join(' - '),
                    mediaBlob: blob
                }
            }));
            
            showToast("📸 Shared media loaded into composer!", "success");
            return;
        }
    } catch (err) {
        console.warn("Could not retrieve shared media blob:", err);
    }

    // Fallback if only text/link was shared
    if (sharedText || sharedUrl) {
        window.dispatchEvent(new CustomEvent('vocalWitness:sharedMediaReady', {
            detail: {
                text: [sharedTitle, sharedText, sharedUrl].filter(Boolean).join(' - '),
                mediaBlob: null
            }
        }));
        showToast("📝 Shared text loaded into composer!", "success");
    }
}
