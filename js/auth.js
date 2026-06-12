// js/auth.js
import { auth, provider } from "./firebase-config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { state } from "./store.js";
import { showToast } from "./utils.js";
import { listenToLedgerFeed } from "./ledger.js"; // Make sure this path is correct

// UI Utility
const updateUI = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};

// The Auth Observer
onAuthStateChanged(auth, (user) => {
    // 1. Update State
    state.user = user;
    state.isWitnessVerified = !!user;

    // 2. Update UI
    const loginPromptModal = document.getElementById('authSection');
    if (user) {
        if (loginPromptModal) loginPromptModal.classList.add('hidden');
        updateUI('userName', user.displayName || "Anonymous Witness");
        updateUI('profileName', user.displayName || "Verified Witness");
        updateUI('profileEmail', user.email || "");
    } else {
        updateUI('userName', "Guest Reader");
    }
    
    // 3. Trigger Feed
    listenToLedgerFeed();
});

// Exported Auth Actions
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
