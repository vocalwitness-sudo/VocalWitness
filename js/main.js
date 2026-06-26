// js/main.js - MINIMAL STABLE VERSION
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';

let currentTab = 'citizen-talk';
let listenersAttached = false;

// ====================== TAB SWITCHING ======================
function switchTab(tab) {
    console.log("🔄 Switching to:", tab);
    currentTab = tab;

    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active');
    });

    if (tab === 'citizen-talk') document.getElementById('citizenBtn')?.classList.add('active');
    if (tab === 'true-witness') document.getElementById('trueBtn')?.classList.add('active');
    if (tab === 'live-arena') document.getElementById('liveBtn')?.classList.add('active');

    if (tab === 'true-witness') {
        showToast("👁️ True Witness Mode", "success");
    } else if (tab === 'live-arena') {
        showToast("🎥 Live Arena - Coming Soon", "info");
    } else {
        showToast("💬 Citizen Talk", "success");
    }

    if (typeof initFeed === 'function') initFeed(db, tab);
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

// ====================== MAIN CLICK HANDLER ======================
function attachUIListeners() {
    if (listenersAttached) return;
    listenersAttached = true;

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        console.log("🖱️ Clicked:", btn.id);

        // Tabs
        if (btn.id === 'citizenBtn') switchTab('citizen-talk');
        else if (btn.id === 'trueBtn') switchTab('true-witness');
        else if (btn.id === 'liveBtn') switchTab('live-arena');

        // Other buttons
        else if (btn.id === 'btn-profile') showProfileSection();
        else if (btn.id === 'btn-close-profile') hideProfileSection();
        else if (btn.id === 'btn-premium') {
            document.getElementById('premiumModal')?.classList.remove('hidden');
        }
        else if (btn.id === 'btn-close-premium') {
            document.getElementById('premiumModal')?.classList.add('hidden');
        }
        else if (btn.id === 'btn-photo') {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (ev) => handleImageSelect(ev, document.getElementById('preview-area'));
            input.click();
        }
        else if (btn.id === 'btn-voice') {
            toggleVoiceRecording(btn);
        }
        else if (btn.id === 'postButton') {
            showToast("Posting coming soon", "info");
        }
    });
}

// ====================== START ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();
        attachUIListeners();
        switchTab(currentTab);

        console.log("✅ Core Loaded");
        showToast("Platform Ready", "success");
    } catch (error) {
        console.error("❌ Failed:", error);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
