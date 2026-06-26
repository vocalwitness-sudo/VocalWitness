// js/main.js - Clean Modern VocalWitness Core
import { initAuth, googleLogin, logout } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast, submitPeerVote } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';
import { generateAndDownloadPDF } from './pdf.js';
import { loadProfile } from './profile.js';

// Global State
let currentTab = 'citizen-talk';
let currentUser = null;

// Main Bootstrap
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        initAuth();
        initLanguage();
        
        // Default tab
        switchTab(currentTab);
        
        attachUIListeners();
        
        console.log("✅ VocalWitness Core Loaded Successfully");
        showToast("Platform Ready", "success");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
        showToast("Failed to initialize app. Please refresh.", "error");
    }
}

// Tab Switching (Modern & Clean)
window.switchTab = function(tab) {
    currentTab = tab;
    
    // Remove active from all nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    // Activate correct button
    if (tab === 'citizen-talk') document.getElementById('citizenBtn').classList.add('active');
    if (tab === 'true-witness') document.getElementById('trueBtn').classList.add('active');
    if (tab === 'live-arena') document.getElementById('liveBtn').classList.add('active');
    
    // TODO: Switch content based on tab
    if (tab === 'true-witness') {
        showToast("👁️ True Witness • Forensic Mode Activated", "success");
    } else if (tab === 'live-arena') {
        showToast("Live Arena - Coming Soon", "info");
    } else {
        showToast("💬 Citizen Talk", "success");
    }
    
    initFeed(db, tab);
};

// UI Event Listeners (Single Handler - No Duplication)
function attachUIListeners() {
    const handler = async (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        try {
            switch (btn.id) {
                case 'postButton':
                    showToast("Full posting flow coming soon (Premium)", "info");
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
                case 'btn-profile':
                    showProfileSection();
                    break;
                case 'btn-close-profile':
                    hideProfileSection();
                    break;
                case 'btn-premium':
                    document.getElementById('premiumModal').classList.remove('hidden');
                    break;
                default:
                    if (btn.dataset.action === 'peer-vote') {
                        submitPeerVote(btn.dataset.id, btn.dataset.type);
                    }
            }
        } catch (err) {
            console.error(err);
            showToast("Action failed", "error");
        }
    };

    document.removeEventListener('click', handler);
    document.addEventListener('click', handler);
}

// Profile Functions
function showProfileSection() {
    document.getElementById('homeSection').classList.add('hidden');
    document.getElementById('profileSection').classList.remove('hidden');
    if (currentUser) loadProfile(currentUser);
    else googleLogin();
}

function hideProfileSection() {
    document.getElementById('profileSection').classList.add('hidden');
    document.getElementById('homeSection').classList.remove('hidden');
}

// Global Exposures
window.showProfileSection = showProfileSection;
window.hideProfileSection = hideProfileSection;
window.logout = logout;
window.googleLogin = googleLogin;

// Start App
document.addEventListener('DOMContentLoaded', bootstrap);
