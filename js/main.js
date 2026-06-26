// js/main.js - Clean Modern VocalWitness Core
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';

// Global State
let currentTab = 'citizen-talk';

// Tab Switching Function
function switchTab(tab) {
    console.log("🔄 Switching to tab:", tab);
    currentTab = tab;

    // Update active button
    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.toggle('active', btn.id === getButtonId(tab));
    });

    // Feedback
    if (tab === 'true-witness') {
        showToast("👁️ True Witness • Forensic Mode Activated", "success");
    } else if (tab === 'live-arena') {
        showToast("🎥 Live Arena — Coming Soon", "info");
    } else {
        showToast("💬 Citizen Talk", "success");
    }

    // Load feed
    if (typeof initFeed === 'function') {
        initFeed(db, tab);
    }
}

function getButtonId(tab) {
    if (tab === 'citizen-talk') return 'citizenBtn';
    if (tab === 'true-witness') return 'trueBtn';
    if (tab === 'live-arena') return 'liveBtn';
    return 'citizenBtn';
}

// Profile Functions
function showProfileSection() {
    console.log("👤 Opening Profile");
    document.getElementById('homeSection').classList.add('hidden');
    document.getElementById('feedContainer').classList.add('hidden'); // Hide feed too
    const profile = document.getElementById('profileSection');
    profile.classList.remove('hidden');
    profile.scrollTop = 0;
}

function hideProfileSection() {
    console.log("👤 Closing Profile");
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('homeSection').classList.remove('hidden');
    document.getElementById('feedContainer').classList.remove('hidden');
}
function hideProfileSection() {
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('homeSection').classList.remove('hidden');
}

// Main Click Handler (Handles Everything)
function attachUIListeners() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        console.log("🖱️ Clicked button:", btn.id);

        // Tab Buttons
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

// Bootstrap
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();

        attachUIListeners();
        
        // Load default tab
        switchTab(currentTab);

        console.log("✅ VocalWitness Core Loaded Successfully");
        showToast("Platform Ready", "success");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
        showToast("Failed to initialize. Refresh page.", "error");
    }
}

// Start
document.addEventListener('DOMContentLoaded', bootstrap);
