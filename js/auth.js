// js/auth.js - Clean Auth with Circle Integration
import {
    signInWithPopup,
    signOut
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import { auth, provider } from './firebase-config.js';
import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { updateAppState } from './app-state.js';
import { applyTierTheme, updateTierBadge } from './tier.js';

// Safe Tier Refresh Helper
function refreshTierUI() {
    if (typeof refreshTierAndUI === 'function') {
        refreshTierAndUI();
    } else {
        if (typeof applyTierTheme === 'function') applyTierTheme();
        if (typeof updateTierBadge === 'function') updateTierBadge();
        console.log("✅ Tier UI refreshed (fallback)");
    }
}

async function createOrUpdateUser(user) {
    if (!user) return;
    try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        
        if (!snap.exists()) {
            await setDoc(userRef, {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || "Anonymous Witness",
                photoURL: user.photoURL,
                tier: "citizen",
                isPhoneVerified: false,
                zkVerified: false,
                credibilityScore: 10,
                createdAt: serverTimestamp(),
                lastActive: serverTimestamp()
            });
            showToast("Welcome to the Square!", "success");
        } else {
            await updateDoc(userRef, { lastActive: serverTimestamp() });
        }
    } catch (e) {
        console.error("User document error:", e);
    }
}

// js/auth.js - Improved googleLogin
let popupInProgress = false;

export async function googleLogin() {
    if (popupInProgress) {
        showToast("Sign-in already in progress...", "info");
        return;
    }

    popupInProgress = true;

    try {
        showToast("Opening Google Sign-In...", "info");

        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        await createOrUpdateUser(user);
        updateAppState({ isAuthenticated: true, currentUser: user });
        refreshTierUI();
        
        // Update header buttons
        if (typeof window.updateHeaderButtons === 'function') {
            window.updateHeaderButtons(true);
        }
        
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
        
        showToast("✅ Signed in successfully! Welcome to the Square.", "success");
        
        // Close login modal if open
        const loginModal = document.getElementById('loginModal');
        if (loginModal) loginModal.classList.add('hidden');

        return user;

    } catch (error) {
        console.error("Login error:", error);

        // Better user-facing messages
        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
            showToast("Sign-in was cancelled. Please try again.", "warning");
        } 
        else if (error.code === 'auth/popup-blocked') {
            showToast("Popup was blocked by your browser. Please allow popups for this site.", "
                      
export async function logout() {
    try {
        await signOut(auth);
        updateAppState({ isAuthenticated: false, currentUser: null });
        showToast("Signed out", "success");
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null } }));
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Logout failed", "error");
    }
}

/**
 * Require Authentication Helper
 * Used before protected actions (posting, uploading media, etc.)
 */
export function requireAuth(message = "Please sign in to continue.") {
    if (!auth.currentUser) {
        showToast(message, "warning");
        // Open login modal
        const loginModal = document.getElementById('loginModal');
        if (loginModal) loginModal.classList.remove('hidden');
        return false;
    }
    return true;
}

export function initAuth() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            await createOrUpdateUser(user);
            updateAppState({ isAuthenticated: true, currentUser: user });
            refreshTierUI();
        } else {
            updateAppState({ isAuthenticated: false, currentUser: null });
        }
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
    });
    console.log("🔐 Auth initialized");
}

// Global exposure
window.googleLogin = googleLogin;
window.logout = logout;
window.requireAuth = requireAuth;
