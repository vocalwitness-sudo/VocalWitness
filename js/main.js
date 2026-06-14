// js/main.js
import { googleLogin, logout } from "./auth.js";
import { initFeed, addPostToFeed } from './feed.js';
import { VocalWitnessEngine } from './engine.js';
import { upgradeToWitnessTier } from './signup.js';
import { db, storage } from './firebase-config.js';
import { showToast, initLanguage } from './utils.js';
import { handleImageSelect, toggleVoiceRecording, resetMediaState } from './media.js';
import { initAuth } from './auth.js';
...
initAuth();

let engine;
let currentFeed = 'citizen-talk';

async function bootstrap() {
    try {
        console.log("🚀 VocalWitness Initializing...");
        engine = new VocalWitnessEngine(db, storage);

        initFeed(db, currentFeed);
        initLanguage();
        attachUIListeners();

        console.log("✅ VocalWitness Node Online");
        showToast("Node Connected Successfully");
    } catch (err) {
        console.error("Bootstrap failed:", err);
        showToast("Failed to initialize node", "error");
    }
}

function attachUIListeners() {
    // Language
    const langSelector = document.getElementById('languageSelector');
    langSelector?.addEventListener('change', (e) => {
        changeLanguage(e.target.value); // from i18n
    });

    // Navigation
    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => {
        currentFeed = 'witness-voice';
        initFeed(db, currentFeed);
        showToast("👁️ Witness Voice Mode");
    });

    document.getElementById('btn-citizentalk')?.addEventListener('click', () => {
        currentFeed = 'citizen-talk';
        initFeed(db, currentFeed);
        showToast("💬 Citizen Talk Mode");
    });

    // Media Buttons
    const photoBtn = document.getElementById('btn-photo');
    const voiceBtn = document.getElementById('btn-voice');

    photoBtn?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area') || document.createElement('div'));
        input.click();
    });

    voiceBtn?.addEventListener('click', () => {
        toggleVoiceRecording(voiceBtn);
    });

    // Post Button
    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();
        if (!text) return showToast("Please provide a description", "error");

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ id: tempId, witnessText: text, timestamp: new Date() }, true);

        try {
            // Use engine for full testimony if audio exists
            if (engine.currentAudioBlob) {
                await engine.uploadTestimony("current-user-id", "en", currentFeed);
            } else {
                // Text-only fallback
                await addDoc(collection(db, "testimonies"), {
                    witnessText: text,
                    feedVisibility: currentFeed,
                    timestamp: new Date().toISOString()
                });
            }
            input.value = '';
            resetMediaState();
            showToast("✅ Published to Decentralized Ledger");
        } catch (e) {
            console.error(e);
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
