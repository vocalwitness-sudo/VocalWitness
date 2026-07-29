// js/auth.js - Clean Auth with Circle Integration + Hybrid UI Support (Redirect Mode) + Email Auth
import {
    signInWithRedirect,
    getRedirectResult,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import { auth, provider } from './firebase-config.js';
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { updateAppState } from './app-state.js';
import { applyTierTheme, updateTierBadge } from './tier.js';

let redirectInProgress = false;

// Safe Tier Refresh Helper
function refreshTierUI() {
    if (typeof refreshTierAndUI === 'function') {
        refreshTierAndUI();
    } else {
        if (typeof applyTierTheme === 'function') applyTierTheme();
        if (typeof updateTierBadge === 'function') updateTierBadge();
    }
}

async function createOrUpdateUser(user) {
    if (!user) return;
    try {
        const userRef = doc(db, "users", user.uid);
        
        // Use setDoc with merge: true so it initializes missing fields or updates lastActive safely
        await setDoc(userRef, {
            uid: user.uid,
            email: user.email || "",
            displayName: user.displayName || "Anonymous Witness",
            photoURL: user.photoURL || "",
            tier: "citizen",
            lastActive: serverTimestamp()
        }, { merge: true });

    } catch (e) {
        console.error("User document error:", e);
    }
}

// ====================== DRAFT & STATE PRESERVATION ======================
function savePendingDraft() {
    const mainInput = document.getElementById('mainInput');
    if (mainInput && mainInput.value.trim() !== '') {
        sessionStorage.setItem('vocal_pending_draft', mainInput.value);
        showToast("Draft saved. We'll restore it after sign-in.", "info");
    }
}

function restorePendingDraft() {
    const draft = sessionStorage.getItem('vocal_pending_draft');
    if (draft) {
        const mainInput = document.getElementById('mainInput');
        if (mainInput) {
            mainInput.value = draft;
            showToast("✅ Your testimony draft has been restored!", "success");
        }
        sessionStorage.removeItem('vocal_pending_draft');
    }
}

// ====================== FIREBASE AUTH ERROR MAPPER ======================
function handleAuthError(error) {
    switch (error.code) {
        case 'auth/too-many-requests':
            return "Too many attempts. For security, please wait a few minutes before trying again.";
        case 'auth/invalid-phone-number':
            return "The phone number format is invalid. Please include your correct country code.";
        case 'auth/quota-exceeded':
            return "SMS service temporarily busy. Please try an alternate verification path.";
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            return "Sign-in was cancelled. Please try again.";
        case 'auth/popup-blocked':
            return "Popup was blocked. Please allow popups for this site.";
        case 'auth/invalid-email':
            return "The email address format is invalid.";
        case 'auth/user-not-found':
            return "No account found with this email address. Please check or sign up.";
        case 'auth/wrong-password':
            return "Incorrect password. Please try again.";
        case 'auth/email-already-in-use':
            return "An account with this email already exists. Try signing in instead.";
        case 'auth/weak-password':
            return "Password should be at least 6 characters long.";
        default:
            return error.message || "Authentication failed. Please check your connection.";
    }
}

// ====================== REDIRECT GOOGLE LOGIN ======================
export async function googleLogin() {
    if (redirectInProgress) {
        showToast("Sign-in already in progress...", "info");
        return;
    }

    redirectInProgress = true;

    try {
        savePendingDraft();
        showToast("Redirecting to Google Sign-In...", "info");
        await signInWithRedirect(auth, provider);
    } catch (error) {
        console.error("Login redirect error:", error);
        const errorMessage = handleAuthError(error);
        showToast(errorMessage, "error");
        redirectInProgress = false;
    }
}

// ====================== EMAIL / PASSWORD AUTH ======================
export async function handleEmailAuth(event) {
    event.preventDefault();
    const email = document.getElementById('authEmail')?.value;
    const password = document.getElementById('authPassword')?.value;

    if (!email || !password) return;

    try {
        savePendingDraft();
        await signInWithEmailAndPassword(auth, email, password);
        showToast("✅ Signed in successfully!", "success");
        closeLoginModal();
        restorePendingDraft();
    } catch (error) {
        console.error("Email sign-in error:", error);
        showToast(handleAuthError(error), "error");
    }
}

export async function handleEmailSignUp(event) {
    event.preventDefault();
    const email = document.getElementById('authEmail')?.value;
    const password = document.getElementById('authPassword')?.value;

    if (!email || !password) return;

    if (password.length < 6) {
        showToast("Password must be at least 6 characters long.", "error");
        return;
    }

    try {
        savePendingDraft();
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await createOrUpdateUser(userCredential.user);
        showToast("🎉 Account created successfully!", "success");
        closeLoginModal();
        closeCreateAccountModal();
        restorePendingDraft();
    } catch (error) {
        console.error("Email sign-up error:", error);
        showToast(handleAuthError(error), "error");
    }
}

// ====================== LOGOUT ======================
export async function logout() {
    try {
        await signOut(auth);
        updateAppState({ isAuthenticated: false, currentUser: null });
        showToast("Signed out successfully", "success");
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null } }));
        updateUIForAuthState();
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Logout failed", "error");
    }
}

// ====================== REQUIRE AUTH (Hybrid Friendly) ======================
export function requireAuth(message = "Please sign in to participate in the Public Square.") {
    if (!auth.currentUser) {
        savePendingDraft(); // Save any active composer text before prompting
        showToast(message, "info");
        
        const loginModal = document.getElementById('loginModal');
        const modalMsg = document.getElementById('loginModalMessage');
        if (modalMsg) modalMsg.textContent = message; // Display contextual reason
        if (loginModal) loginModal.classList.remove('hidden');
        return false;
    }
    return true;
}
// ====================== UI SYNC FOR HYBRID READ/WRITE MODEL ======================
export function updateUIForAuthState() {
    const isLoggedIn = !!auth.currentUser;
    const guestBtn = document.getElementById('guest-action-btn');
    const profileBtn = document.getElementById('profile-btn');
    const signInBtn = document.getElementById('signin-btn'); // Safe check added
    const privateElements = document.querySelectorAll('.requires-auth');

    if (guestBtn) {
        guestBtn.classList.toggle('hidden', isLoggedIn);
        const guestBtnText = document.getElementById('guest-btn-text');
        if (guestBtnText) guestBtnText.textContent = isLoggedIn ? '' : 'Join VocalWitness';
    }

    // Safely toggle sign-in / profile buttons if present in DOM
    if (signInBtn) {
        signInBtn.classList.toggle('hidden', isLoggedIn);
    }
    if (profileBtn) {
        profileBtn.classList.toggle('hidden', !isLoggedIn);
    }

    // Toggle public vs private sensitive data blocks across pages
    privateElements.forEach(el => {
        el.classList.toggle('hidden', !isLoggedIn);
    });

    // Adjust composer/interactive buttons opacity for guests
    document.querySelectorAll('#postButton, #btn-photo, #btn-voice').forEach(btn => {
        if (btn) btn.style.opacity = isLoggedIn ? '1' : '0.6';
    });

    // Update header buttons if helper exists
    if (typeof window.updateHeaderButtons === 'function') {
        window.updateHeaderButtons(isLoggedIn);
    }
}

    // Header buttons & profile toggle matching requirement
    if (signInBtn) {
        signInBtn.classList.toggle('hidden', isLoggedIn);
    }
    if (profileBtn) {
        profileBtn.classList.toggle('hidden', !isLoggedIn);
    }

    // Toggle public vs private sensitive data blocks across pages
    privateElements.forEach(el => {
        el.classList.toggle('hidden', !isLoggedIn);
    });

    // Disable composer/interactive buttons for guests
    document.querySelectorAll('#postButton, #btn-photo, #btn-voice').forEach(btn => {
        if (btn) btn.style.opacity = isLoggedIn ? '1' : '0.6';
    });

    // Update header buttons if helper exists
    if (typeof window.updateHeaderButtons === 'function') {
        window.updateHeaderButtons(isLoggedIn);
    }


// ====================== INIT AUTH ======================
export function initAuth() {
    // Handle the result when the user returns from Google's redirect page
    getRedirectResult(auth)
        .then(async (result) => {
            if (result && result.user) {
                const user = result.user;
                await createOrUpdateUser(user);
                updateAppState({ isAuthenticated: true, currentUser: user });
                refreshTierUI();
                
                if (typeof window.updateHeaderButtons === 'function') {
                    window.updateHeaderButtons(true);
                }
                
                window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
                updateUIForAuthState();

                showToast("✅ Signed in successfully! Welcome to the Square.", "success");
                
                const loginModal = document.getElementById('loginModal');
                if (loginModal) loginModal.classList.add('hidden');
                restorePendingDraft();
            }
        })
        .catch((error) => {
            console.error("Redirect result error:", error);
            const errorMessage = handleAuthError(error);
            showToast(errorMessage, "error");
        });

    auth.onAuthStateChanged(async (user) => {
        if (user) {
            await createOrUpdateUser(user);
            updateAppState({ isAuthenticated: true, currentUser: user });
            refreshTierUI();
        } else {
            updateAppState({ isAuthenticated: false, currentUser: null });
        }
        
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
        updateUIForAuthState();   // Keep UI in sync
    });
    
    updateUIForAuthState();   // Keep UI in sync on load

    console.log("🔐 Auth initialized (Redirect Mode + Email Support)");
}

// Global exposure
window.googleLogin = googleLogin;
window.handleEmailAuth = handleEmailAuth;
window.handleEmailSignUp = handleEmailSignUp;
window.logout = logout;
window.requireAuth = requireAuth;
window.updateUIForAuthState = updateUIForAuthState;

// Show appropriate modal based on state
window.showAuthModal = function() {
    if (auth.currentUser) {
        window.showProfile();
    } else {
        const createModal = document.getElementById('createAccountModal');
        if (createModal) createModal.classList.remove('hidden');
        else document.getElementById('loginModal')?.classList.remove('hidden');
    }
};

// Close modals
window.closeLoginModal = function() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.classList.add('hidden');
};

window.closeCreateAccountModal = function() {
    const createModal = document.getElementById('createAccountModal');
    if (createModal) createModal.classList.add('hidden');
};
