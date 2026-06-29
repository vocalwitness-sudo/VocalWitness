// js/main.js
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';
import { getTierInfo, canAccessFeature } from './tier.js';

// ====================== NAVIGATION ======================
function highlightActiveNav(feedType = 'citizen') {
    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.feed === feedType) {
            btn.classList.add('active');
        }
    });
}

window.loadFeed = (feedType) => {
    highlightActiveNav(feedType);
    
    if (typeof initFeed === 'function') {
        initFeed(db, feedType);
    }
    
    // Optional: Update URL
    const path = feedType === 'citizen' ? '/' : `/${feedType}-witness`;
    window.history.pushState({ feed: feedType }, '', path);
};

// ====================== BACK BUTTON ======================
window.goBack = () => {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = '/';
    }
};

function toggleBackButton() {
    const backBtn = document.getElementById('back-button');
    if (backBtn) {
        const isHome = window.location.pathname === '/' || window.location.pathname.includes('index');
        backBtn.classList.toggle('hidden', isHome);
    }
}

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
                // your guardian logic
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
        loadFeed('citizen');
        toggleBackButton();

        console.log("✅ VocalWitness Core Loaded Successfully");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
