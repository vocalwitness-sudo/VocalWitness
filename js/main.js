// js/main.js
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';
import { getTierInfo, canAccessFeature } from './tier.js';

// ====================== UTILITIES ======================
function getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('true-witness')) return 'true-witness';
    if (path.includes('live-arena')) return 'live-arena';
    return 'citizen-talk';
}

function highlightActiveNav() {
    const current = getCurrentPage(); 
    // Target the button elements specifically
    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active');
        // Match the feed type to the button's data attribute or content
        if (btn.textContent.toLowerCase().includes(current.replace('-', ' '))) {
            btn.classList.add('active');
        }
    });
}

// ====================== FEATURE GATING ======================
function applyFeatureGating(userData) {
    // Example: Hide Forensic Shield button for non-True Witness users
    const forensicBtn = document.getElementById('btn-photo');
    if (forensicBtn && !canAccessFeature(userData, 'forensic_shield')) {
        forensicBtn.textContent = "📸 Photo (Basic)";
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
            case 'btn-close-profile':
                window.hideProfileSection?.();
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
            // Add more as needed
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
        highlightActiveNav();

        const currentPage = getCurrentPage();
        if (typeof initFeed === 'function') {
            initFeed(db, currentPage);
        }

        console.log("✅ VocalWitness Core Loaded Successfully");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
    }
}

window.loadFeed = (feedType) => {
    // 1. Remove 'active' class from all nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // 2. Add 'active' class to the clicked button
    event.target.classList.add('active');

    // 3. Trigger the feed load
    // We pass the db object as your initFeed requires it based on bootstrap()
    if (typeof initFeed === 'function') {
        initFeed(db, feedType); 
    }

    // 4. Update the URL without reloading the page (SEO/History friendly)
    const newPath = feedType === 'citizen' ? '/' : `/${feedType.replace('_', '-')}`;
    window.history.pushState({ feed: feedType }, '', newPath);
    
    // 5. Toggle the back button visibility
    toggleBackButton();
};

window.goBack = () => {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = '/';
    }
};

// Show/hide back button based on page
function toggleBackButton() {
    const backBtn = document.getElementById('back-button');
    if (backBtn) {
        const isHome = window.location.pathname === '/' || window.location.pathname.includes('index');
        backBtn.classList.toggle('hidden', isHome);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
