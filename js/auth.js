import { auth, provider } from "./firebase-config.js";
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { showToast } from "./utils.js";

export let currentUser = null;

onAuthStateChanged(auth, (user) => {
    const loginPromptModal = document.getElementById('authSection');
    
    if (user) {
        currentUser = user;
        if (loginPromptModal) loginPromptModal.classList.add('hidden'); 
        
        if (document.getElementById('userName')) {
            document.getElementById('userName').textContent = user.displayName || "Anonymous Witness";
        }
        if (document.getElementById('profileName')) {
            document.getElementById('profileName').textContent = user.displayName || "Verified Witness";
        }
        if (document.getElementById('profileEmail')) {
            document.getElementById('profileEmail').textContent = user.email || "";
        }
        
        // Broadcast event to refresh global UI indicators dynamically
        window.dispatchEvent(new CustomEvent('nodeAuthChanged', { detail: user }));
    } else {
        currentUser = null;
        if (document.getElementById('userName')) {
            document.getElementById('userName').textContent = "Guest Reader";
        }
    }
    
    if (window.listenToLedgerFeed) window.listenToLedgerFeed();
});

export async function googleLogin() {
    try {
        await signInWithPopup(auth, provider);
        showToast("Signed in successfully!", "success");
    } catch (error) {
        console.error(error);
        showToast("Authentication failed.", "error");
    }
}
window.googleLogin = googleLogin;

export async function logout() {
    if (confirm("Disconnect from VocalWitness?")) {
        try {
            await signOut(auth);
            location.reload();
        } catch (error) {
            showToast("Error signing out.", "error");
        }
    }
}
window.logout = logout;
