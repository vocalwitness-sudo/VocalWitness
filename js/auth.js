// js/auth.js - CLEANED & FIXED
import { auth, provider } from './firebase-config.js';
import { 
    signInWithPopup, 
    signOut, 
    onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db } from './firebase-config.js';

export let currentUser = null;

export function initAuth() {
    console.log("🔐 Initializing Authentication...");

    onAuthStateChanged(auth, async (user) => {
        currentUser = user;
        if (user) {
            console.log("✅ Auth state changed:", user.email);
            try {
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);
                
                if (!userSnap.exists()) {
                    await setDoc(userRef, {
                        email: user.email,
                        displayName: user.displayName || user.email.split('@')[0],
                        createdAt: new Date(),
                        isPremium: false,
                        trustScore: 50
                    });
                }
            } catch (err) {
                console.error("User profile init failed:", err);
            }
        } else {
            console.log("👤 No user signed in");
        }
    });
}

export async function googleLogin() {
    try {
        const result = await signInWithPopup(auth, provider);
        console.log("✅ Google login successful:", result.user.email);
        return result.user;
    } catch (error) {
        console.error("Google login error:", error);
        return null;
    }
}

export async function logout() {
    try {
        await signOut(auth);
        console.log("✅ Logged out successfully");
        location.reload();
    } catch (error) {
        console.error("Logout error:", error);
    }
}

// Make available globally
window.googleLogin = googleLogin;
window.logout = logout;
