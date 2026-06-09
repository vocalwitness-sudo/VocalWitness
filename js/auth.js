/**
 * VocalWitness Auth Module
 * Manages identity state and observer patterns for Node synchronization
 */
import { auth, provider } from "./firebase-config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showToast } from "./utils.js";
import { listenToLedgerFeed } from "./feed.js"; // Import directly

export let currentUser = null;

// The Auth Observer
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const loginPromptModal = document.getElementById('authSection');
    
    // UI Utility
    const updateUI = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    if (user) {
        if (loginPromptModal) loginPromptModal.classList.add('hidden');
        updateUI('userName', user.displayName || "Anonymous Witness");
        updateUI('profileName', user.displayName || "Verified Witness");
        updateUI('profileEmail', user.email || "");
    } else {
        updateUI('userName', "Guest Reader");
    }
    
    // Refresh ledger feed directly via import, no window check needed
    listenToLedgerFeed();
});

export async function googleLogin() {
    try {
        await signInWithPopup(auth, provider);
        showToast("⚡ Node Identity Synced.");
    } catch (error) {
        console.error("Auth Error:", error);
        showToast("❌ Identity Sync Failed.");
    }
}

export async function logout() {
    if (confirm("Disconnect from VocalWitness node?")) {
        try {
            await signOut(auth);
            window.location.reload();
        } catch (error) {
            showToast("Error signing out.");
        }
    }
}
