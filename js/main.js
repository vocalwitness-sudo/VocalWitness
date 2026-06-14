// js/main.js
import { initAuth, logout } from "./auth.js";
import { initFeed, addPostToFeed } from './feed.js';
import { VocalWitnessEngine } from './engine.js';
import { upgradeToWitnessTier } from './signup.js';
import { db, storage } from './firebase-config.js';
import { showToast, initLanguage } from './utils.js';
import { handleImageSelect, toggleVoiceRecording, resetMediaState } from './media.js';

let engine;
let currentFeed = 'citizen-talk';

export async function init() {
    try {
        console.log("🚀 VocalWitness Initializing...");
        engine = new VocalWitnessEngine(db, storage);
        initAuth();
        initFeed(db, currentFeed);
        initLanguage();
        attachUIListeners();
        console.log("✅ VocalWitness Node Online");
    } catch (err) {
        console.error("Initialization failed:", err);
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
        if (typeof window.changeLanguage === 'function') {
            window.changeLanguage(e.target.value);
        }
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

    // === MEDIA HANDLERS ===
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        // Create preview area if it doesn't exist
        let previewArea = document.getElementById('preview-area');
        if (!previewArea) {
            previewArea = document.createElement('div');
            previewArea.id = 'preview-area';
            const composer = document.getElementById('composer');
            const textarea = document.getElementById('mainInput');
            if (composer && textarea) {
                textarea.parentNode.insertBefore(previewArea, textarea.nextSibling);
            }
        }

        input.onchange = (e) => handleImageSelect(e, previewArea);
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', () => {
        toggleVoiceRecording(document.getElementById('btn-voice'));
    });

    // === POST BUTTON ===
    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();
        if (!text) return showToast("Please provide a description", "error");

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ id: tempId, witnessText: text }, true);

        try {
            // Dynamic import (safe for CDN setup)
            const { addDoc, collection } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");

            await addDoc(collection(db, "testimonies"), {
                witnessText: text,
                feedVisibility: currentFeed,
                authorId: engine?.currentUserId || "anonymous",
                timestamp: new Date().toISOString()
            });

            input.value = '';
            resetMediaState();
            showToast("✅ Published to Ledger");
        } catch (e) {
            console.error("Publish error:", e);
            showToast("Failed to publish", "error");
        }
    });

    // === PROFILE ===
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.remove('hidden');
    });

    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.add('hidden');
    });

    document.getElementById('btn-logout')?.addEventListener('click', logout);
    document.getElementById('vw-btn')?.addEventListener('click', upgradeToWitnessTier);
}
