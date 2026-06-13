// js/main.js - VocalWitness Main Entry Point
import { googleLogin, logout } from "./auth.js";
import { initFeed, addPostToFeed, removePostFromFeed } from './feed.js';
import { VocalWitnessEngine } from './engine.js';
import { upgradeToWitnessTier } from './signup.js';
import { getFirestore, collection, addDoc } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { app } from './firebase-config.js';

// Core setup
const db = getFirestore(app);
const engine = new VocalWitnessEngine(db);   // if engine.js is properly written

let currentFeed = 'citizentalk';

// Bootstrap
async function bootstrap() {
    console.log("✅ VocalWitness Engine Initializing...");

    try {
        // Initialize feed
        if (typeof initFeed === 'function') initFeed(db);

        // Wire UI
        attachUIListeners();

        console.log("✅ VocalWitness is ready.");
    } catch (err) {
        console.error("Initialization failed:", err);
    }
}

function attachUIListeners() {
    // Post Button
    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.addEventListener('click', async () => {
            const input = document.getElementById('mainInput');
            const text = input.value.trim();
            if (!text) return alert("Please write something.");

            const tempId = 'temp-' + Date.now();
            if (typeof addPostToFeed === 'function') {
                addPostToFeed({ witnessText: text, id: tempId }, true);
            }

            input.value = "";

            try {
                await addDoc(collection(db, "testimonies"), {
                    witnessText: text,
                    feedVisibility: currentFeed,
                    timestamp: new Date().toISOString()
                });
                alert("✅ Published successfully!");
            } catch (err) {
                console.error(err);
                if (typeof removePostFromFeed === 'function') removePostFromFeed(tempId);
                alert("Failed to publish.");
            }
        });
    }

    // Navigation
    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => switchFeed('witness-voice'));
    document.getElementById('btn-citizentalk')?.addEventListener('click', () => switchFeed('citizentalk'));
    document.getElementById('btn-livearena')?.addEventListener('click', () => switchFeed('live-arena'));

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

function switchFeed(feedType) {
    currentFeed = feedType;
    console.log(`Switched to ${feedType}`);
    // TODO: Call feed refresh here when feed.js is ready
    if (typeof initFeed === 'function') initFeed(db);
}

// Start the app
document.addEventListener('DOMContentLoaded', bootstrap);
