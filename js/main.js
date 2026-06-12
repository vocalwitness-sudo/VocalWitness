// js/main.js
import { initAuth } from './auth.js';
import { initFeed } from './feed.js';
import { VocalWitnessEngine } from './engine.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { app } from './firebase-config.js'; // Ensure app is exported from config

const db = getFirestore(app);
const engine = new VocalWitnessEngine(db);

// Orchestrator: Initializes all UI and logic modules
async function bootstrap() {
    try {
        console.log("VocalWitness Engine Initializing...");
        
        // 1. Initialize Authentication
        initAuth();

        // 2. Initialize UI Feed
        initFeed(db);

        // 3. Initialize Web Worker for ZK
        const zkWorker = new Worker('./js/zk-worker.js');
        window.zkWorker = zkWorker; // Expose to global if needed

        console.log("VocalWitness ready.");
    } catch (err) {
        console.error("Initialization Failed:", err);
    }
}

// Ensure DOM is ready before starting
document.addEventListener('DOMContentLoaded', bootstrap);

// js/main.js
document.getElementById('postButton').addEventListener('click', async () => {
    const input = document.getElementById('mainInput');
    const text = input.value.trim();
    if (!text) return alert("Enter text.");

    // 1. Optimistic UI: Add to DOM immediately
    const tempId = 'temp-' + Date.now();
    addPostToFeed({ witnessText: text, id: tempId, status: 'syncing' });
    input.value = ""; // Clear input immediately

    // 2. Background Sync
    try {
        await addDoc(collection(db, "testimonies"), {
            witnessText: text,
            feedVisibility: 'citizentalk',
            timestamp: new Date()
        });
        // 3. Optional: Update status to 'verified' after success
    } catch (err) {
        // 4. Rollback: If it fails, remove the temp post
        removePostFromFeed(tempId);
        showToast("Publishing failed, please try again.", "error");
    }
});
