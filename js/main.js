// js/main.js
import { initAuth, handleGoogleLogin, handleLogout } from './auth.js';
import { initFeed, addPostToFeed, removePostFromFeed } from './feed.js';
import { VocalWitnessEngine } from './engine.js';
import { upgradeToWitnessTier } from './signup.js';
import { getFirestore, collection, addDoc } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { app } from './firebase-config.js';

const db = getFirestore(app);
const engine = new VocalWitnessEngine(db);

async function bootstrap() {
    try {
        console.log("VocalWitness Engine Initializing...");
        
        // 1. Init Modules
        initAuth();
        initFeed(db);

        // 2. Initialize Web Worker
        window.zkWorker = new Worker('./js/zk-worker.js');

        // 3. Attach UI Event Listeners
        attachEventListeners();

        console.log("VocalWitness ready.");
    } catch (err) {
        console.error("Initialization Failed:", err);
    }
}

function attachEventListeners() {
    // Post Button (Optimistic)
    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.addEventListener('click', async () => {
            const input = document.getElementById('mainInput');
            const text = input.value.trim();
            if (!text) return alert("Enter text.");

            const tempId = 'temp-' + Date.now();
            addPostToFeed({ witnessText: text, id: tempId }, true);
            input.value = "";

            try {
                await addDoc(collection(db, "testimonies"), {
                    witnessText: text,
                    feedVisibility: 'citizentalk',
                    timestamp: new Date()
                });
            } catch (err) {
                removePostFromFeed(tempId);
                console.error("Sync failed", err);
            }
        });
    }

    // Profile/Auth Buttons
    const logoutBtn = document.querySelector('[onclick="logout()"]');
    const verifyBtn = document.querySelector('[onclick="manageVerification()"]');

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (verifyBtn) verifyBtn.addEventListener('click', upgradeToWitnessTier);
}

document.addEventListener('DOMContentLoaded', bootstrap);
