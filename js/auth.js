/**
 * VocalWitness Auth Module
 * Handles identity state via Firebase. 
 * Dispatches events so other modules can react without being tightly coupled.
 */
// js/auth.js
import { auth, provider } from "./firebase-config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { state } from "./storage.js"; // Importing the state defined in storage.js
import { showToast } from "./utils.js";

// ... rest of your auth code (onAuthStateChanged, googleLogin, logout)

// Internal UI helper - scoped only to this file
const updateUI = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};

// Initialize Observer
onAuthStateChanged(auth, (user) => {
    // 1. Update Global State
    state.user = user;
    state.isWitnessVerified = !!user;

    // 2. Update Auth UI
    const authSection = document.getElementById('authSection');
    if (user) {
        if (authSection) authSection.classList.add('hidden');
        updateUI('userName', user.displayName || "Anonymous Witness");
        updateUI('profileName', user.displayName || "Verified Witness");
        updateUI('profileEmail', user.email || "");
    } else {
        updateUI('userName', "Guest Reader");
    }

    // 3. Announce the change to the rest of the app
    // This allows main.js to trigger feed loads without auth.js needing to import feed.js
    const authEvent = new CustomEvent('auth-changed', { detail: { user } });
    window.dispatchEvent(authEvent);
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
