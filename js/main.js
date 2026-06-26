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

// ====================== UI EVENT LISTENERS ======================
function attachUIListeners() {
    const mainClickHandler = async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;

        console.log("🔘 Button clicked:", btn.id || btn.textContent?.trim().slice(0, 40));

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
                    if (typeof window.showProfileSection === 'function') {
                        window.showProfileSection();
                    } else {
                        console.warn("showProfileSection not found - using fallback");
                        document.getElementById('profileSection')?.classList.add('active');
                        document.getElementById('homeSection')?.classList.remove('active');
                    }
                    break;

                case 'btn-close-profile':
                    if (typeof window.hideProfileSection === 'function') {
                        window.hideProfileSection();
                    } else {
                        document.getElementById('profileSection')?.classList.remove('active');
                        document.getElementById('homeSection')?.classList.add('active');
                    }
                    break;

                case 'btn-download-pdf':
                    const postId = btn.dataset.postId;
                    if (postId && typeof generateAndDownloadPDF === 'function') {
                        generateAndDownloadPDF(postId);
                    } else {
                        showToast("PDF download coming soon", "info");
                    }
                    break;

                case 'btn-logout':
                    logout();
                    break;

                case 'btn-premium':
                    showToast("Premium features (Unlimited posts, AI tools, Priority) coming soon", "info");
                    break;

                // Additional useful buttons
                case 'btn-witness-voice':
                case 'btn-citizen-talk':
                    if (typeof window.switchFeed === 'function') {
                        window.switchFeed(btn.id.includes('witness') ? 'witness-voice' : 'citizen-talk');
                    } else {
                        location.reload(); // fallback
                    }
                    break;

                default:
                    // Try data-action attribute for extra buttons
                    const action = btn.getAttribute('data-action');
                    if (action === 'peer-vote') {
                        const id = btn.getAttribute('data-id');
                        const type = btn.getAttribute('data-type');
                        if (id && type) submitPeerVote(id, type);
                    }
                    break;
            }
        } catch (err) {
            console.error("UI Handler Error:", err);
            showToast("Action failed. Please try again.", "error");
        }
    };

    // Remove any old listeners to prevent duplicates
    document.removeEventListener('click', mainClickHandler);
    document.addEventListener('click', mainClickHandler);

    // Language selector
    const langSelector = document.getElementById('languageSelector');
    if (langSelector) {
        langSelector.addEventListener('change', (e) => {
            changeLanguage(e.target.value);
        });
    }
}

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
