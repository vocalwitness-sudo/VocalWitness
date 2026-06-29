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

    // Highlight active tab
    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.feed === feedType) {
            btn.classList.add('active');
        }
    });

    const feedContainer = document.getElementById('feedContainer');
    if (feedContainer) {
        feedContainer.innerHTML = `<div class="py-12 text-center text-zinc-400">Loading ${feedType} feed...</div>`;
    }

    if (typeof initFeed === 'function') {
        initFeed(db, feedType);
    } else {
        console.error("❌ initFeed not available");
    }
};

// ====================== UI LISTENERS ======================
function attachUIListeners() {
    console.log("👂 UI Listeners Attached");

    // Profile Button
    const profileBtn = document.getElementById('btn-profile');
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            window.showProfileSection?.();
        });
    }

    // Guardian Button
    const guardianBtn = document.getElementById('btn-guardian');
    if (guardianBtn) {
        guardianBtn.addEventListener('click', () => {
            document.getElementById('guardianModal')?.classList.remove('hidden');
        });
    }

    // Close Guardian Modal
    const closeGuardian = document.getElementById('btn-close-guardian');
    if (closeGuardian) {
        closeGuardian.addEventListener('click', () => {
            document.getElementById('guardianModal')?.classList.add('hidden');
        });
    }

    // Photo Button
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (ev) => handleImageSelect(ev, document.getElementById('preview-area'));
            input.click();
        });
    }

    // Voice Button
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', (e) => {
            toggleVoiceRecording(e.currentTarget);
        });
    }

    // Post Button (example)
    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.addEventListener('click', () => {
            window.publishTestimony?.();   // Implement in next phase
        });
    }
}

// ====================== PROFILE MODAL ======================
window.showProfileSection = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
};

// ====================== LANGUAGE (Global Exposure) ======================
window.changeLanguage = changeLanguage;   // ← This fixes the "not defined" error

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();           // Loads language selector + translations
        attachUIListeners();
        window.loadFeed('citizen'); // Default feed

        console.log("✅ VocalWitness Loaded Successfully");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
        showToast("Failed to initialize app", "error");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
