import { auth, provider } from "./firebase-config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { state } from "./storage.js";
import { showToast } from "./utils.js";

const updateUI = (id, value) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
};

onAuthStateChanged(auth, (user) => {
    state.user = user;
    state.isWitnessVerified = !!user;

    const authSection = document.getElementById('authSection');
    if (user) {
        if (authSection) authSection.classList.add('hidden');
        updateUI('userName', user.displayName || "Anonymous Witness");
        updateUI('profileName', user.displayName || "Verified Witness");
        updateUI('profileEmail', user.email || "");
    } else {
        updateUI('userName', "Guest Reader");
    }

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
