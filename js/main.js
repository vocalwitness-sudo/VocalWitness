import { googleLogin, logout } from "./auth.js"; 
import { initFeed, addPostToFeed, removePostFromFeed } from './feed.js';
import { VocalWitnessEngine } from './engine.js';
import { upgradeToWitnessTier } from './signup.js';
import { getFirestore, collection, addDoc } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { app } from './firebase-config.js';

// 1. Core Initialization
const db = getFirestore(app);
const engine = new VocalWitnessEngine(db);

/**
 * Bootstrap: Orchestrates the startup sequence
 */
async function bootstrap() {
    try {
        console.log("VocalWitness Engine Initializing...");
        
        // Initialize Modules
        initAuth();
        initFeed(db);

        // Initialize Background Workers
        window.zkWorker = new Worker('./js/zk-worker.js');

        // Wire up UI events
        attachUIListeners();

        console.log("VocalWitness ready.");
    } catch (err) {
        console.error("Initialization Failed:", err);
    }
}

/**
 * Event Listeners: Separating UI interaction from App Logic
 */
function attachUIListeners() {
    // --- Navigation Listeners ---
    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => {
        console.log("Switching to Witness Voice...");
        // Call your engine/feed filter logic here
    });

    document.getElementById('btn-citizentalk')?.addEventListener('click', () => {
        console.log("Switching to Citizen Talk...");
        // Call your engine/feed filter logic here
    });

    document.getElementById('btn-livearena')?.addEventListener('click', () => {
        console.log("Switching to Live Arena...");
        // Call your engine/feed filter logic here
    });

    // --- Post Button (Optimistic UI Update) ---
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
                console.error("Sync failed:", err);
            }
        });
    }

    // --- Profile/Auth Actions ---
    // Updated selectors to match your HTML ID attributes
    const logoutBtn = document.getElementById('btn-logout');
    const verifyBtn = document.getElementById('vw-btn');
    const profileBtn = document.getElementById('btn-profile');
    const closeProfileBtn = document.getElementById('btn-close-profile');

    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
    if (verifyBtn) verifyBtn.addEventListener('click', upgradeToWitnessTier);
    
    // UI Toggles for Profile Modal
    if (profileBtn) {
        profileBtn.addEventListener('click', () => {
            document.getElementById('profilePage').classList.remove('hidden');
        });
    }
    if (closeProfileBtn) {
        closeProfileBtn.addEventListener('click', () => {
            document.getElementById('profilePage').classList.add('hidden');
        });
    }
}

/**
 * Reactivity: Event-driven feed updates
 * Triggered automatically by auth.js dispatching 'auth-changed'
 */
window.addEventListener('auth-changed', (event) => {
    console.log("User session updated. Refreshing ledger...");
    initFeed(db); 
});

// Run bootstrap when DOM is fully loaded
document.addEventListener('DOMContentLoaded', bootstrap);
