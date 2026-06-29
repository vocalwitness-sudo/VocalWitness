// js/main.js
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';

// ====================== FEED SWITCHING (Fixed Mapping) ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);
    
    // Normalize feed types
    const feedMap = {
        'citizen': 'citizen-talk',
        'true': 'true-witness',
        'live': 'live'
    };
    const normalized = feedMap[feedType] || feedType;

    // Highlight active tab
    document.querySelectorAll('#main-nav button, .nav-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.feed === feedType) {
            btn.classList.add('active');
        }
    });

    const feedContainer = document.getElementById('feedContainer');
    if (feedContainer) {
        feedContainer.innerHTML = `<div class="py-12 text-center text-zinc-400">Loading ${normalized} feed...</div>`;
    }

    if (typeof initFeed === 'function') {
        initFeed(db, normalized);
    } else {
        console.error("❌ initFeed not available");
        showToast("Feed system not ready", "error");
    }
};

// ====================== OTHER UTILITIES ======================
window.goBack = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/';
};

// ====================== CLICK HANDLER ======================
function attachUIListeners() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        switch(btn.id) {
            case 'btn-profile':
                // Implement profile if needed
                break;
            case 'btn-photo':
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = (ev) => handleImageSelect(ev, document.getElementById('preview-area'));
                input.click();
                break;
            case 'btn-voice':
                toggleVoiceRecording(btn);
                break;
            case 'postButton':
                window.publishTestimony?.();
                break;
            case 'btn-guardian':
                document.getElementById('guardianModal')?.classList.remove('hidden');
                break;
            case 'btn-activate-guardian':
                showToast("Guardian activation coming soon", "info");
                break;
            case 'btn-close-guardian':
                document.getElementById('guardianModal')?.classList.add('hidden');
                break;
        }
    });
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();
        attachUIListeners();

        // DEFAULT TO CITIZEN TALK (as per your preference)
        let defaultFeed = 'citizen';

        // Override based on URL for other pages
        const path = window.location.pathname;
        if (path.includes('true-witness')) defaultFeed = 'true';
        else if (path.includes('live-arena')) defaultFeed = 'live';

        window.loadFeed(defaultFeed);

        console.log("✅ VocalWitness Core Loaded Successfully | Default:", defaultFeed);
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
    }
}
