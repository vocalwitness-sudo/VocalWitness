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
