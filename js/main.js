// js/main.js
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';

// ====================== FEED SWITCHING ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);

    // Highlight active tab
    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.feed === feedType) {
            btn.classList.add('active');
        }
    });

    // Clear current feed
    const feedContainer = document.getElementById('feedContainer');
    if (feedContainer) {
        feedContainer.innerHTML = `<div class="py-12 text-center text-zinc-400">Loading ${feedType} feed...</div>`;
    }

    // Load the feed
    if (typeof initFeed === 'function') {
        initFeed(db, feedType);
    } else {
        console.error("❌ initFeed function is not available");
        showToast("Feed system not ready yet", "error");
    }
};

// ====================== BACK BUTTON ======================
window.goBack = () => {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = '/';
    }
};

// ====================== CLICK HANDLER ======================
function attachUIListeners() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        switch(btn.id) {
            case 'btn-profile':
                window.showProfileSection?.();
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
                // Add guardian logic later
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

        // Default load
        window.loadFeed('citizen');

        console.log("✅ VocalWitness Core Loaded Successfully");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
