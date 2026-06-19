import { googleLogin, logout, initAuth } from "./auth.js";
import { initFeed, addPostToFeed } from './feed.js';
import { db, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import {
    handleImageSelect,
    toggleVoiceRecording,
    resetMediaState,
    uploadForensicMedia,
    selectedImageFile,
    setEngine
} from './media.js';
import { addDoc, collection } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { VocalWitnessEngine } from './engine.js';
import { state } from './storage.js';
import { generateAndDownloadPDF } from './pdf.js';

let currentFeed = 'citizen-talk';
let engine = null;

// Main initialization
async function bootstrap() {
    try {
        console.log("🚀 Initializing VocalWitness...");

        initAuth();
        initLanguage();

        engine = new VocalWitnessEngine(db, storage);
        setEngine(engine);

        initFeed(db, currentFeed);
        attachUIListeners();

        console.log("✅ Core Loaded Successfully");
        showToast("Platform Ready");
    } catch (err) {
        console.error("Bootstrap error:", err);
        showToast("Initialization issue - check console", "error");
    }
}

function attachUIListeners() {
    console.log("🔗 Attaching buttons...");

    // Remove old listeners to prevent conflicts
    document.querySelectorAll('button, select').forEach(el => {
        const newEl = el.cloneNode(true);
        el.parentNode.replaceChild(newEl, el);
    });

    // Language
    document.getElementById('languageSelector')?.addEventListener('change', (e) => {
        changeLanguage(e.target.value);
    });

    // Feed Navigation (Most Important)
    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => {
        currentFeed = 'witness-voice';
        document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-witnessvoice').classList.add('active');
        initFeed(db, currentFeed);
        showToast("👁️ Witness Voice Mode Activated");
    });

    document.getElementById('btn-citizentalk')?.addEventListener('click', () => {
        currentFeed = 'citizen-talk';
        document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
        document.getElementById('btn-citizentalk').classList.add('active');
        initFeed(db, currentFeed);
        showToast("💬 Citizen Talk Mode Activated");
    });

    // Profile
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        if (!state?.user) {
            showToast("Please sign in first", "error");
            googleLogin();
            return;
        }
        document.getElementById('homeSection').classList.remove('active');
        document.getElementById('profileSection').classList.add('active');
        updateProfileUI(state.user);
    });

    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
        document.getElementById('profileSection').classList.remove('active');
        document.getElementById('homeSection').classList.add('active');
    });

    // PDF Download
    document.getElementById('btn-download-pdf')?.addEventListener('click', async () => {
        if (!state?.user) return showToast("Please sign in first", "error");
        await generateAndDownloadPDF(state.user, db);
    });

    // Media buttons
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) voiceBtn.addEventListener('click', () => toggleVoiceRecording(voiceBtn));

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', logout);
}

// Profile UI Update
function updateProfileUI(user) {
    document.getElementById('profile-username').textContent = user?.displayName || "@citizen";
    document.getElementById('profile-email').textContent = user?.email || "guest@vocalwitness.io";
}

// Start the app
document.addEventListener('DOMContentLoaded', bootstrap);
window.addEventListener('load', bootstrap); // Extra safety

// Register Service Worker
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        // Because your sw.js is in the root, use '/sw.js'
        navigator.serviceWorker.register('/VocalWitness/sw.js')
            .then(registration => {
                console.log('✅ ServiceWorker registered with scope:', registration.scope);
            })
            .catch(error => {
                console.error('❌ ServiceWorker registration failed:', error);
            });
    });
}
