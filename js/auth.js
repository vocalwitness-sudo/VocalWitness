// js/auth.js - Clean Auth with User Document Creation
import { 
    getAuth, 
    signInWithPopup, 
    GoogleAuthProvider, 
    signOut 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import { db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';

const auth = getAuth();
const provider = new GoogleAuthProvider();

export { auth };

// Create or update user document
async function createUserDocument(user) {
    if (!user) return;

    try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
            await setDoc(userRef, {
                uid: user.uid,
                email: user.email,
                displayName: user.displayName || "Anonymous Witness",
                photoURL: user.photoURL || null,
                tier: "citizen",
                isPhoneVerified: false,
                zkVerified: false,
                credibilityScore: 10,
                integrityScore: 100,
                createdAt: new Date().toISOString(),
                lastActive: new Date().toISOString(),
                joinDate: new Date().toISOString()
            });
            console.log("✅ New user document created");
            showToast("Welcome to VocalWitness!", "success");
        } else {
            // Update last active time
            await updateDoc(userRef, {
                lastActive: new Date().toISOString()
            });
        }
    } catch (error) {
        console.error("User document error:", error);
    }
}

// Google Sign In
export async function googleLogin() {
    try {
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        
        await createUserDocument(user);
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
        
        showToast(`Signed in as ${user.displayName || 'Witness'}`, "success");
        return user;
    } catch (error) {
        console.error("Google login failed:", error);
        showToast("Login failed. Try again.", "error");
    }
}

// Logout
export async function logout() {
    try {
        await signOut(auth);
        showToast("Signed out successfully", "success");
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null } }));
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Logout failed", "error");
    }
}

// Listen to auth state changes
export function initAuth() {
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            await createUserDocument(user);
            window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
        } else {
            window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null } }));
        }
    });
    
    console.log("🔐 Auth system initialized");
}

// Expose globally
window.googleLogin = googleLogin;
window.logout = logout;

// Call this after login to refresh tier/theme
export function refreshUserTier() {
  import('./tier.js').then(({ getCurrentUserTier, applyTierTheme, updateTierBadge }) => {
    getCurrentUserTier().then(tier => {
      applyTierTheme(tier);
      updateTierBadge();
    });
  });
}

// Update initAuth to call refresh - Helper to refresh tier after login
export function refreshUserTier() {
  import('./tier.js').then(({ getCurrentUserTier, applyTierTheme, updateTierBadge }) => {
    getCurrentUserTier().then(tier => {
      applyTierTheme(tier);
      updateTierBadge();
    }).catch(console.warn);
  }).catch(console.warn);
}
