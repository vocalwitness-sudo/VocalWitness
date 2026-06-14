// js/auth.js
import { auth, provider } from "./firebase-config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { state } from "./storage.js";
import { showToast } from "./utils.js";

export function initAuth() {
    onAuthStateChanged(auth, (user) => {
        state.user = user;
        state.isWitnessVerified = !!user; // Update later with real verification

        if (user) {
            document.getElementById('profile-username').textContent = user.displayName || "Witness";
            document.getElementById('profile-email').textContent = user.email || "";
        }
    });
}

export async function googleLogin() {
    try {
        await signInWithPopup(auth, provider);
        showToast("✅ Identity Synced Successfully");
    } catch (error) {
        console.error(error);
        showToast("❌ Google Sign-in Failed", "error");
    }
}

export async function logout() {
    if (confirm("Disconnect from VocalWitness Node?")) {
        await signOut(auth);
        window.location.reload();
    }
}
