// js/main.js - Clean & Complete
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

// --- State ---
let currentFeed = 'citizen-talk';

// --- Initialization ---
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");

    initAuth();
    initLanguage();
    initStorage();

    // Start with Citizen Talk (default)
    initFeed(db, currentFeed);
    setCurrentMode(currentFeed);   // Important for media module

    attachUIListeners();

    console.log("✅ Core Loaded Successfully");
    showToast("Platform Ready", "success");
}

// --- Event Listeners ---
function attachUIListeners() {
    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;

        switch (btn.id) {
            case 'postButton':
            case 'btn-post':
                // TODO: Connect to full post handler later
                showToast("Post feature coming soon (Premium)", "info");
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
                // TODO: Get current user from state or auth
                showToast("PDF generation coming soon", "info");
                break;

            case 'btn-logout':
                logout();
                break;

            case 'btn-premium':
                showToast("Premium features coming soon", "info");
                break;
        }
    });

    // Language Selector
    const langSelector = document.getElementById('languageSelector');
    if (langSelector) {
        langSelector.addEventListener('change', (e) => {
            changeLanguage(e.target.value);
        });
    }
}

// ====================== PROFILE NAVIGATION ======================
function showProfileSection() {
    document.getElementById('homeSection')?.classList.remove('active');
    document.getElementById('profileSection')?.classList.add('active');
    
    // Load enhanced profile
    const currentUser = auth?.currentUser; // from auth module
    if (currentUser) {
        loadProfile(currentUser);
    } else {
        googleLogin();
    }
}

function hideProfileSection() {
    document.getElementById('profileSection')?.classList.remove('active');
    document.getElementById('homeSection')?.classList.add('active');
}

// ====================== FEED SWITCHING ======================
export function switchFeed(newFeed) {
    currentFeed = newFeed;
    
    // Update media module mode
    setCurrentMode(newFeed);

    // Re-initialize feed
    initFeed(db, newFeed);

    // Visual feedback
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.toggle('active', 
            (newFeed === 'witness-voice' && btn.textContent.includes('Witness')) ||
            (newFeed === 'citizen-talk' && btn.textContent.includes('Citizen'))
        );
    });

    showToast(newFeed === 'witness-voice' 
        ? "👁️ Switched to Witness Voice (Forensic Mode)" 
        : "💬 Switched to Citizen Talk", "success");
}

// --- Start App ---
document.addEventListener('DOMContentLoaded', bootstrap);
