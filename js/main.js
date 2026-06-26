// js/main.js - Clean & Modern VocalWitness Core (No Duplicates)
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';

// Global State
let currentTab = 'citizen-talk';

// ====================== TAB SWITCHING ======================
function switchTab(tab) {
    console.log("🔄 Switching to tab:", tab);
    currentTab = tab;

    // Update active states
    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active');
    });

    if (tab === 'citizen-talk') document.getElementById('citizenBtn')?.classList.add('active');
    if (tab === 'true-witness') document.getElementById('trueBtn')?.classList.add('active');
    if (tab === 'live-arena') document.getElementById('liveBtn')?.classList.add('active');

    // Feedback
    if (tab === 'true-witness') {
        showToast("👁️ True Witness • Forensic Mode Activated", "success");
    } else if (tab === 'live-arena') {
        showToast("🎥 Live Arena — Coming Soon", "info");
    } else {
        showToast("💬 Citizen Talk", "success");
    }

    if (typeof initFeed === 'function') {
        initFeed(db, tab);
    }
}

// ====================== PROFILE ======================
function showProfileSection() {
    console.log("👤 Opening Profile");
    document.getElementById('homeSection')?.classList.add('hidden');
    document.getElementById('feedContainer')?.classList.add('hidden');
    document.getElementById('profileSection')?.classList.remove('hidden');
}

function hideProfileSection() {
    console.log("👤 Closing Profile");
    document.getElementById('profileSection')?.classList.add('hidden');
    document.getElementById('homeSection')?.classList.remove('hidden');
    document.getElementById('feedContainer')?.classList.remove('hidden');
}

// ====================== CLICK HANDLER ======================
function attachUIListeners() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        console.log("🖱️ Clicked button:", btn.id);

        // Tabs
        if (btn.id === 'citizenBtn') switchTab('citizen-talk');
        if (btn.id === 'trueBtn') switchTab('true-witness');
        if (btn.id === 'liveBtn') switchTab('live-arena');

        // Other buttons
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
    });
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();

        attachUIListeners();
        switchTab(currentTab);   // Load default tab

        console.log("✅ VocalWitness Core Loaded Successfully");
        showToast("Platform Ready", "success");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
        showToast("Failed to initialize. Please refresh.", "error");
    }
}

// Start App
document.addEventListener('DOMContentLoaded', bootstrap);
