// js/auth.js - Enhanced Authentication
import { auth, provider, db } from './firebase-config.js';
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from "./utils.js";
import { updateUser } from './storage.js';

/**
 * Create or update user document with full schema
 */
async function syncUserToFirestore(user) {
    if (!user) return;

    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    const baseData = {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || user.email?.split('@')[0] || "Citizen",
        username: user.email?.split('@')[0]?.toLowerCase() || `user_${Date.now()}`,
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
        lastNameChange: null,
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    };

    if (!userSnap.exists()) {
        await setDoc(userRef, baseData);
        console.log("✅ New user profile created in Firestore");
        showToast("Welcome to VocalWitness! 🎉", "success");
    } else {
        // Update last activity
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
            console.log("✅ Auth state: Signed in as", user.email);
            await syncUserToFirestore(user);
            updateUser(user);           // Update global reactive state
        } else {
            console.log("👤 No user signed in");
            updateUser(null);
        }
    });
}

export async function googleLogin() {
    try {
        const result = await signInWithPopup(auth, provider);
        console.log("✅ Google Sign-In successful");
        return result.user;
    } catch (error) {
        console.error("Google login error:", error);
        showToast("Google Sign-In failed: " + (error.message || "Please try again"), "error");
        return null;
    }
}

export async function logout() {
    try {
        await signOut(auth);
        showToast("Signed out successfully", "success");
        // Optional: full page reload for clean state
        // location.reload();
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Error signing out", "error");
    }
}

// Make functions available globally for HTML buttons
window.googleLogin = googleLogin;
window.logout = logout;
