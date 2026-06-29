// js/main.js
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';

// ====================== FEED SWITCHING ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);

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
    }
};

// ====================== BUTTON HANDLERS ======================
function attachUIListeners() {
    console.log("👂 UI Listeners Attached");

    // Profile
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        window.showProfileSection();
    });

    // Guardian
    document.getElementById('btn-guardian')?.addEventListener('click', () => {
        document.getElementById('guardianModal')?.classList.remove('hidden');
    });

    // Close Guardian
    document.getElementById('btn-close-guardian')?.addEventListener('click', () => {
        document.getElementById('guardianModal')?.classList.add('hidden');
    });

    // Photo & Voice
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (ev) => handleImageSelect(ev, document.getElementById('preview-area'));
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', (e) => {
        toggleVoiceRecording(e.target);
    });
}

// ====================== PROFILE MODAL ======================
window.showProfileSection = () => {
    document.getElementById('profileModal')?.classList.remove('hidden');
};

window.closeProfile = () => {
    document.getElementById('profileModal')?.classList.add('hidden');
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();           // ← Language system
        attachUIListeners();

        window.loadFeed('citizen');

        console.log("✅ VocalWitness Loaded Successfully");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
