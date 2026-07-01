// js/auth.js - CLEAN & FIXED
import { auth, provider, db } from './firebase-config.js';
import { signInWithPopup, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from "./utils.js";
import { updateUser } from './storage.js';
import { getUserTier } from './tier.js';

async function syncUserToFirestore(user) {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    const baseData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || "Citizen",
        username: (user.email?.split('@')[0] || `user_${Date.now()}`).toLowerCase(),
        photoURL: user.photoURL || "",
        role: "citizen",
        tier: "Explorer",
        trustCircle: 50,
        reputationScore: 50,
        level: 1,
        bio: "",
        preferredLanguage: "en",
        isPhoneVerified: false,
        phoneNumber: "",
        zkVerified: false,
        testimoniesCount: 0,
        verificationsMade: 0,
        endorsementsReceived: 0,
        successfulEvidence: 0,
        debunkedEvidence: 0,
        badges: ["new_citizen"],
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    };

    baseData.tier = getUserTier(baseData);

    if (!userSnap.exists()) {
        await setDoc(userRef, baseData);
        showToast("Welcome to VocalWitness! 🎉", "success");
    } else {
        await setDoc(userRef, {
            lastUpdated: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        }, { merge: true });
    }
}

export function initAuth() {
    console.log("🔐 Initializing Authentication...");
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log("✅ Auth state:", user.email);
            await syncUserToFirestore(user);
            updateUser(user);
            window.updateAuthUI?.(user);
        } else {
            console.log("👤 No user signed in");
            updateUser(null);
            window.updateAuthUI?.(null);
        }
    });
}

export async function googleLogin() {
    try {
        const result = await signInWithPopup(auth, provider);
        return result.user;
    } catch (error) {
        console.error("Google login error:", error);
        showToast("Sign-in failed: " + (error.message || "Please try again"), "error");
        return null;
    }
}

export async function signUpWithEmail(email, password) {
    try {
        const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js");
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await syncUserToFirestore(userCredential.user);
        showToast("Account created successfully!", "success");
        return userCredential.user;
    } catch (error) {
        console.error(error);
        showToast(error.message, "error");
        return null;
    }
}

export async function logout() {
    try {
        await signOut(auth);
        showToast("Signed out successfully", "success");
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Error signing out", "error");
    }
}

// NEW: Added for main.js
export function getCurrentUser() {
    return auth.currentUser;
}

// Global exposures
window.googleLogin = googleLogin;
window.logout = logout;
