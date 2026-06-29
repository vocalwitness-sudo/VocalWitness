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
    document.querySelectorAll('#main-nav a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').includes(current)) {
            link.classList.add('active');
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
