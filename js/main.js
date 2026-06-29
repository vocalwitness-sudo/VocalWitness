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
        if (btn.dataset.feed === feedType) btn.classList.add('active');
    });

    const feedContainer = document.getElementById('feedContainer');
    if (feedContainer) {
        feedContainer.innerHTML = `<div class="py-12 text-center text-zinc-400">Loading ${feedType} feed...</div>`;
    }

    if (typeof initFeed === 'function') {
        initFeed(db, feedType);
    } else {
        showToast("Feed system not ready", "error");
    }
};

// ====================== BACK BUTTON ======================
window.goBack = () => {
    if (window.history.length > 1) window.history.back();
    else window.location.href = '/';
};

// ====================== CLICK HANDLER (Reliable) ======================
function attachUIListeners() {
    console.log("👂 Attaching UI listeners...");

    // Direct button listeners (most reliable)
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        window.showProfileSection();
    });

    document.getElementById('btn-guardian')?.addEventListener('click', () => {
        document.getElementById('guardianModal')?.classList.remove('hidden');
    });

    // Event delegation as backup
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        switch (btn.id) {
            case 'btn-close-guardian':
                document.getElementById('guardianModal')?.classList.add('hidden');
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
        }
    });
}

// ====================== PROFILE & MODAL HELPERS ======================
window.showProfileSection = () => {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
        console.log("✅ Profile modal opened");
    } else {
        console.error("❌ Profile modal not found");
    }
};

window.closeProfile = () => {
    document.getElementById('profileModal')?.classList.add('hidden');
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();
        attachUIListeners();

        window.loadFeed('citizen');

        console.log("✅ VocalWitness Core Loaded Successfully");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
