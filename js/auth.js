// js/auth.js - Clean Auth with Circle Integration + Hybrid UI Support (Redirect Mode)
import {
    signInWithRedirect,
    getRedirectResult,
    signOut
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
        showToast("Redirecting to Google Sign-In...", "info");
        await signInWithRedirect(auth, provider);
    } catch (error) {
        console.error("Login redirect error:", error);
        const errorMessage = handleAuthError(error);
        showToast(errorMessage, "error");
        redirectInProgress = false;
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
        showToast(message, "info");
        const loginModal = document.getElementById('loginModal');
        if (loginModal) loginModal.classList.remove('hidden');
        return false;
    }
    return true;
}

// ====================== UI SYNC FOR HYBRID READ/WRITE MODEL ======================
export function updateUIForAuthState() {
    const isLoggedIn = !!auth.currentUser;

    // Update header buttons
    if (typeof window.updateHeaderButtons === 'function') {
        window.updateHeaderButtons(isLoggedIn);
    }

    // Optional: Visual feedback on action buttons
    document.querySelectorAll('#postButton, #btn-photo, #btn-voice').forEach(btn => {
        btn.style.opacity = isLoggedIn ? '1' : '0.75';
    });
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

    console.log("🔐 Auth initialized (Redirect Mode)");
}

// Global exposure
window.googleLogin = googleLogin;
window.logout = logout;
window.requireAuth = requireAuth;
window.updateUIForAuthState = updateUIForAuthState;
