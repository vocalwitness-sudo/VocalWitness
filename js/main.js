// js/main.js - Updated for Multi-Page
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';

// Detect current page
function getCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('true-witness')) return 'true-witness';
    if (path.includes('live-arena')) return 'live-arena';
    return 'citizen-talk'; // default
}

// ====================== NAVIGATION ======================
function highlightActiveNav() {
    const current = getCurrentPage();
    document.querySelectorAll('#main-nav a').forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href').includes(current)) {
            link.classList.add('active');
        }
    });
}

// ====================== PUBLISH & OTHER FUNCTIONS (keep most as-is) ======================
async function publishTestimony() {
    // ... your existing function (keep it)
}

// ====================== CLICK HANDLER ======================
function attachUIListeners() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        console.log("🖱️ Clicked:", btn.id || btn.textContent.trim());

        // Other buttons (keep these)
        if (btn.id === 'btn-profile') showProfileSection();
        if (btn.id === 'btn-close-profile') hideProfileSection();
        if (btn.id === 'btn-photo') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (ev) => handleImageSelect(ev, document.getElementById('preview-area'));
            input.click();
        }
        if (btn.id === 'btn-voice') toggleVoiceRecording(btn);
        if (btn.id === 'btn-premium') {
            document.getElementById('premiumModal')?.classList.remove('hidden');
        }
        if (btn.id === 'postButton') publishTestimony();
        if (btn.id === 'btn-upgrade-now' || btn.id === 'btn-close-premium') {
            // your existing premium logic
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
        highlightActiveNav();           // New
        const currentPage = getCurrentPage();
        console.log(`✅ Loaded ${currentPage} mode`);
        
        if (typeof initFeed === 'function') {
            initFeed(db, currentPage);
        }
        
        console.log("✅ VocalWitness Core Loaded Successfully");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
