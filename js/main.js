// js/main.js
import { googleLogin, logout, initAuth } from "./auth.js";
import { initFeed, addPostToFeed } from './feed.js';
import { VocalWitnessEngine } from './engine.js';
import { upgradeToWitnessTier } from './signup.js';
import { db, storage } from './firebase-config.js';
import { showToast, initLanguage } from './utils.js';
import { handleImageSelect, toggleVoiceRecording, resetMediaState } from './media.js';

let engine;
let currentFeed = 'citizen-talk';

async function bootstrap() {
    try {
        console.log("🚀 VocalWitness Initializing...");
        engine = new VocalWitnessEngine(db, storage);

        initAuth();           // ← Important
        initFeed(db, currentFeed);
        initLanguage();
        attachUIListeners();

        console.log("✅ VocalWitness Node Online");
    } catch (err) {
        console.error("Bootstrap failed:", err);
        showToast("Failed to initialize node", "error");
    }
}

function attachUIListeners() {
    // Auth UI updates
    window.addEventListener('auth-changed', (e) => {
        const user = e.detail.user;
        if (user) {
            document.getElementById('profile-username').textContent = user.displayName || "Witness";
            document.getElementById('profile-email').textContent = user.email || "";
        }
    });

    // Language selector
    document.getElementById('languageSelector')?.addEventListener('change', (e) => {
        changeLanguage(e.target.value); // from i18n.js
    });

    // Navigation buttons
    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => {
        currentFeed = 'witness-voice';
        initFeed(db, currentFeed);
    });

    document.getElementById('btn-citizentalk')?.addEventListener('click', () => {
        currentFeed = 'citizen-talk';
        initFeed(db, currentFeed);
    });

    // Media
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area') || document.createElement('div'));
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', () => toggleVoiceRecording(document.getElementById('btn-voice')));

    // Post
    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();
        if (!text) return showToast("Please provide a description", "error");

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ id: tempId, witnessText: text }, true);

        try {
            // TODO: integrate engine.uploadTestimony() later
            await addDoc(collection(db, "testimonies"), { // you'll need to import addDoc if not already
                witnessText: text,
                feedVisibility: currentFeed,
                authorId: engine?.currentUserId || "anonymous",
                timestamp: new Date().toISOString()
            });
            input.value = '';
            resetMediaState();
            showToast("✅ Published to Ledger");
        } catch (e) {
            showToast("Failed to publish", "error");
        }
    });

    // Profile
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.remove('hidden');
    });
    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.add('hidden');
    });

    document.getElementById('btn-logout')?.addEventListener('click', logout);
    document.getElementById('vw-btn')?.addEventListener('click', upgradeToWitnessTier);
}

document.addEventListener('DOMContentLoaded', bootstrap);
