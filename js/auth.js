// js/auth.js
import { auth, provider } from "./firebase-config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { state } from "./storage.js";
import { showToast } from "./utils.js";

export function initAuth() {
    onAuthStateChanged(auth, (user) => {
        state.user = user;
        state.isWitnessVerified = !!user;

        // Dispatch event so main.js / UI can react
        const authEvent = new CustomEvent('auth-changed', { detail: { user } });
        window.dispatchEvent(authEvent);

        if (!user) {
            showToast("Guest Mode Active");
        }
    });
}

export async function googleLogin() {
    try {
        await signInWithPopup(auth, provider);
        showToast("✅ Node Identity Synced");
    } catch (error) {
        console.error("Auth Error:", error);
        showToast("❌ Identity Sync Failed", "error");
    }
}

export async function logout() {
    if (confirm("Disconnect from VocalWitness node?")) {
        try {
            await signOut(auth);
            window.location.reload();
        } catch (error) {
            showToast("Error signing out", "error");
        }
    }
}
