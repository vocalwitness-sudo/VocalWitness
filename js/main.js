// js/main.js
import { googleLogin, logout } from "./auth.js";
import { initFeed, addPostToFeed } from './feed.js';
import { VocalWitnessEngine } from './engine.js';
import { upgradeToWitnessTier } from './signup.js';
import { db, app } from './firebase-config.js';
import { showToast } from './utils.js';

let engine;

async function bootstrap() {
    try {
        console.log("🚀 VocalWitness Initializing...");
        engine = new VocalWitnessEngine(db, app.storage); // storage from config

        initFeed(db);
        attachUIListeners();

        console.log("✅ VocalWitness Node Online");
    } catch (err) {
        console.error("Bootstrap failed:", err);
        showToast("Failed to initialize node", "error");
    }
}

function attachUIListeners() {
    // Navigation
    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => showToast("Witness Voice Mode Active"));
    document.getElementById('btn-citizentalk')?.addEventListener('click', () => showToast("Citizen Talk Mode Active"));

    // Post Button
    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input.value.trim();
        if (!text) return showToast("Please write something", "error");

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ id: tempId, witnessText: text }, true);
        input.value = "";

        try {
            await addDoc(collection(db, "testimonies"), {
                witnessText: text,
                feedVisibility: 'citizen-talk',
                timestamp: new Date()
            });
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

// Global access
window.googleLogin = googleLogin;
window.engine = engine; // for debugging / media.js

document.addEventListener('DOMContentLoaded', bootstrap);
