// js/main.js - Updated for Multi-Page + Guardian Witness
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';

// ====================== UTILITIES & NAV ======================
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

// ====================== GUARDIAN WITNESS ======================
function showGuardianModal() {
    document.getElementById('guardianModal')?.classList.remove('hidden');
}

function hideGuardianModal() {
    document.getElementById('guardianModal')?.classList.add('hidden');
}

function activateGuardianWitness() {
    showToast("🛡️ Activating Guardian Witness...", "info");
    setTimeout(() => {
        showToast("✅ You are now a Guardian Witness!", "success");
        hideGuardianModal();
    }, 1500);
}

// ====================== PUBLISH & ACTIONS ======================
async function publishTestimony() {
    const textarea = document.getElementById('mainInput');
    const text = textarea?.value.trim();
    if (!text || text.length < 10) {
        showToast("Please write a proper testimony (min 10 characters)", "error");
        return;
    }
    showToast("Publishing to the Square...", "info");
    try {
        console.log("📤 Publishing testimony:", text);
        if (textarea) textarea.value = '';
        showToast("✅ Testimony published successfully!", "success");
    } catch (err) {
        showToast("Failed to publish.", "error");
    }
}

// ====================== CLICK HANDLER ======================
function attachUIListeners() {
    document.addEventListener('click', (e) => {
        // 1. Delegation for dynamic elements
        if (e.target.classList.contains('verify-btn')) {
            const id = e.target.dataset.id;
            // Ensure submitPeerVote is imported or defined
            if (typeof submitPeerVote === 'function') submitPeerVote(id, 'verify');
            return;
        }

        // 2. Standard buttons
        const btn = e.target.closest('button');
        if (!btn) return;

        switch(btn.id) {
            case 'btn-profile':
                document.getElementById('profileSection')?.classList.remove('hidden');
                break;
            case 'btn-close-profile':
                document.getElementById('profileSection')?.classList.add('hidden');
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
                publishTestimony();
                break;
            case 'btn-guardian':
                showGuardianModal();
                break;
            case 'btn-activate-guardian':
                activateGuardianWitness();
                break;
            case 'btn-close-guardian':
                hideGuardianModal();
                break;
        }
    });
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        // 1. Ensure Auth is set up
        await initAuth();
        
        // 2. UI Setup
        initLanguage();
        attachUIListeners();
        highlightActiveNav();
        
        // 3. Feed Setup
        const currentPage = getCurrentPage();
        if (typeof initFeed === 'function') {
            initFeed(db, currentPage);
        }
        
        console.log("✅ VocalWitness Core Loaded Successfully");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
        
        // In your bootstrap()
const feedContainer = document.getElementById('feedContainer');

if (feedContainer) {
    // Only run if the element actually exists on THIS page
    initFeed(db, currentPage);
} else {
    console.warn("Feed container not found on this page. Skipping feed init.");
}
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
