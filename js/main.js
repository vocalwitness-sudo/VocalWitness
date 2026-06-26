// js/main.js - Upgraded VocalWitness Core
import { logout, initAuth, googleLogin } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast, submitPeerVote } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import {
    handleImageSelect,
    toggleVoiceRecording,
    resetMediaState,
    setCurrentMode
} from './media.js';
import { generateAndDownloadPDF } from './pdf.js';
import { initStorage } from './storage.js';
import { loadProfile } from './profile.js';

// --- Global State ---
let currentFeed = 'citizen-talk';
let currentUser = null;

// --- Main Bootstrap ---
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");

    try {
        // Initialize core modules
        initAuth();
        initLanguage();
        initStorage();

        // Default feed
        setCurrentMode(currentFeed);
        initFeed(db, currentFeed);

        attachUIListeners();
        
        console.log("✅ VocalWitness Core Loaded Successfully");
        showToast("Platform Ready", "success");
    } catch (error) {
        console.error("❌ Bootstrap failed:", error);
        showToast("Failed to initialize app. Please refresh.", "error");
    }
}

// --- UI Event Listeners ---
function attachUIListeners() {
    const mainClickHandler = async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;

        try {
            switch (btn.id) {
                case 'postButton':
                case 'btn-post':
                    showToast("Full posting coming soon (Premium feature)", "info");
                    break;

                case 'btn-photo':
                    const fileInput = document.createElement('input');
                    fileInput.type = 'file';
                    fileInput.accept = 'image/*';
                    fileInput.onchange = (e) => {
                        const preview = document.getElementById('preview-area');
                        if (preview) handleImageSelect(e, preview);
                    };
                    fileInput.click();
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

                case 'btn-download-pdf':
                    const postId = btn.dataset.postId;
                    if (postId) {
                        generateAndDownloadPDF(postId);
                    } else {
                        showToast("Please select a testimony to download", "warning");
                    }
                    break;

                case 'btn-logout':
                    logout();
                    break;

                case 'btn-premium':
                    showToast("Premium subscription coming soon", "info");
                    break;

                default:
                    // Handle other buttons if needed
                    break;
            }
        } catch (err) {
            console.error("UI Handler Error:", err);
            showToast("Action failed. Please try again.", "error");
        }
    };

    document.addEventListener('click', mainClickHandler);

    // Language Selector
    const langSelector = document.getElementById('languageSelector');
    if (langSelector) {
        langSelector.addEventListener('change', (e) => {
            changeLanguage(e.target.value);
        });
    }
}

// ====================== PROFILE SECTION ======================
function showProfileSection() {
    const homeSection = document.getElementById('homeSection');
    const profileSection = document.getElementById('profileSection');

    if (homeSection) homeSection.classList.remove('active');
    if (profileSection) profileSection.classList.add('active');

    currentUser = window.auth?.currentUser; // assuming auth is exposed globally

    if (currentUser) {
        loadProfile(currentUser);
    } else {
        showToast("Please sign in to view profile", "warning");
        googleLogin();
    }
}

function hideProfileSection() {
    const homeSection = document.getElementById('homeSection');
    const profileSection = document.getElementById('profileSection');

    if (profileSection) profileSection.classList.remove('active');
    if (homeSection) homeSection.classList.add('active');
}

// ====================== FEED SWITCHING ======================
export function switchFeed(newFeed) {
    currentFeed = newFeed;
    setCurrentMode(newFeed);
    initFeed(db, newFeed);

    // Update active nav buttons
    document.querySelectorAll('.nav-btn').forEach(btn => {
        const isWitness = newFeed === 'witness-voice' && btn.textContent.toLowerCase().includes('witness');
        const isCitizen = newFeed === 'citizen-talk' && btn.textContent.toLowerCase().includes('citizen');
        
        btn.classList.toggle('active', isWitness || isCitizen);
    });

    showToast(
        newFeed === 'witness-voice' 
            ? "👁️ Switched to Witness Voice • Forensic Mode" 
            : "💬 Switched to Citizen Talk",
        "success"
    );
}

// ====================== GLOBAL EXPOSURES ======================
window.switchFeed = switchFeed;           // Make available for inline HTML calls
window.submitPeerVote = submitPeerVote;   // Safety for feed buttons

// ====================== START APP ======================
document.addEventListener('DOMContentLoaded', bootstrap);
