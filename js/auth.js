// js/auth.js - Clean Auth with Circle Integration
import {
    getAuth,
    signInWithPopup,
    GoogleAuthProvider,
    signOut
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { updateAppState } from './app-state.js';
import { applyTierTheme, updateTierBadge } from './tier.js';

const auth = getAuth();
const provider = new GoogleAuthProvider();

export { auth };

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

export async function googleLogin() {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        await createOrUpdateUser(user);
        updateAppState({ isAuthenticated: true, currentUser: user });
        refreshTierUI();                    // Safe call
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
        return user;
    } catch (error) {
        console.error("Login error:", error);
        showToast("Login failed. Please try again.", "error");
    }
}

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

export function initAuth() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            await createOrUpdateUser(user);
            updateAppState({ isAuthenticated: true, currentUser: user });
            refreshTierUI();                // Safe call
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
