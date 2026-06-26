// js/main.js - Clean & Modern VocalWitness Core
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

    if (tab === 'citizen-talk') {
        document.getElementById('citizenBtn')?.classList.add('active');
    } else if (tab === 'true-witness') {
        document.getElementById('trueBtn')?.classList.add('active');
    } else if (tab === 'live-arena') {
        document.getElementById('liveBtn')?.classList.add('active');
    }

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

// ====================== PUBLISH TESTIMONY ======================
async function publishTestimony() {
    const textarea = document.getElementById('mainInput');
    const text = textarea?.value.trim();

    if (!text || text.length < 10) {
        showToast("Please write a proper testimony (min 10 characters)", "error");
        return;
    }

    showToast("Publishing to the Square...", "info");

    try {
        // TODO: Connect to vocalWitnessEngine.js here
        console.log("📤 Publishing testimony:", text);
        
        // Example integration point:
        // await vocalWitnessEngine.publish({ text, type: currentTab });

        showToast("✅ Testimony published successfully!", "success");
        textarea.value = ''; // Clear input
    } catch (err) {
        console.error(err);
        showToast("Failed to publish. Please try again.", "error");
    }
}

// ====================== CLICK HANDLER ======================
function attachUIListeners() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        console.log("🖱️ Clicked:", btn.id || btn.textContent.trim());

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
        if (btn.id === 'postButton') {
            publishTestimony();
        }
        if (btn.id === 'btn-upgrade-now') {
            showToast("Redirecting to payment...", "info");
            // Paystack code here later
        }
        if (btn.id === 'btn-close-premium') {
            document.getElementById('premiumModal')?.classList.add('hidden');
        }
    });
}

// Profile functions (keep your existing ones)
function showProfileSection() {
    document.getElementById('homeSection')?.classList.add('hidden');
    document.getElementById('feedContainer')?.classList.add('hidden');
    document.getElementById('profileSection')?.classList.remove('hidden');
}

function hideProfileSection() {
    document.getElementById('profileSection')?.classList.add('hidden');
    document.getElementById('homeSection')?.classList.remove('hidden');
    document.getElementById('feedContainer')?.classList.remove('hidden');
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();
        attachUIListeners();
        switchTab(currentTab); // Default tab
        console.log("✅ VocalWitness Core Loaded Successfully");
        showToast("Platform Ready", "success");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
        showToast("Failed to initialize. Please refresh.", "error");
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
