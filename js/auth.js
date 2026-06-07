import { auth, provider } from "./firebase-config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showToast } from "./utils.js";

export let currentUser = null;

// The Auth Observer
onAuthStateChanged(auth, (user) => {
    currentUser = user;
    const loginPromptModal = document.getElementById('authSection');
    
    // UI Updates - safely checking if elements exist before updating
    const updateUI = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    if (user) {
        if (loginPromptModal) loginPromptModal.classList.add('hidden');
        updateUI('userName', user.displayName || "Anonymous Witness");
        updateUI('profileName', user.displayName || "Verified Witness");
        updateUI('profileEmail', user.email || "");
        
        window.dispatchEvent(new CustomEvent('nodeAuthChanged', { detail: user }));
    } else {
        updateUI('userName', "Guest Reader");
    }
    
    // Refresh ledger feed on auth state change
    if (typeof window.listenToLedgerFeed === 'function') {
        window.listenToLedgerFeed();
    }
});

export async function googleLogin() {
    try {
        await signInWithPopup(auth, provider);
        showToast("Signed in successfully!", "success");
    } catch (error) {
        console.error("Auth Error:", error);
        showToast("Authentication failed.", "error");
    }
}
window.googleLogin = googleLogin;

export async function logout() {
    if (confirm("Disconnect from VocalWitness?")) {
        try {
            await signOut(auth);
            window.location.reload();
        } catch (error) {
            showToast("Error signing out.", "error");
        }
    }
}
window.logout = logout;
