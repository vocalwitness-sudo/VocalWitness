// js/auth.js
import { auth, provider } from './firebase-config.js';
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import { showToast } from "./utils.js";
import { updateUser } from './storage.js';
import { db } from './firebase-config.js'; 
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/**
 * Initializes the Auth listener.
 * This is the "single source of truth" for auth state.
 */
export function initAuth() {
    onAuthStateChanged(auth, (user) => {
        console.log("🔐 Auth state:", user ? user.email : "Guest");

        // 1. Sync with reactive storage
        updateUser(user);

        // 2. Dispatch custom event for other modules
        const event = new CustomEvent('auth-changed', { 
            detail: { user } 
        });
        window.dispatchEvent(event);

        // 3. Update the UI
        updateAuthUI(user);
    });
}

/**
 * Updates UI elements based on authentication status.
 */
function updateAuthUI(user) {
    const profileBtn = document.getElementById('btn-profile');
    const logoutBtn = document.getElementById('btn-logout');
   
    if (user) {
        if (profileBtn) profileBtn.textContent = "👤 " + (user.displayName || "Profile");
        if (logoutBtn) logoutBtn.textContent = "Logout";
    } else {
        if (profileBtn) profileBtn.textContent = "👤 Profile";
        if (logoutBtn) logoutBtn.textContent = "Sign In";
    }
}

async function syncUserToFirestore(user) {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    // If this is their first time, create the profile
    if (!userSnap.exists()) {
        await setDoc(userRef, {
            email: user.email,
            displayName: user.displayName,
            photoURL: user.photoURL,
            role: "admin", // Sets you as admin
            createdAt: new Date().toISOString()
        });
        console.log("✅ User synced to Firestore");
    }
}
// --- Auth Actions ---

export async function googleLogin() {
    try {
        await signInWithPopup(auth, provider);
        showToast("Welcome to VocalWitness!", "success");
    } catch (error) {
        console.error("Google login error:", error);
        showToast("Login failed: " + error.message, "error");
    }
}

export async function emailSignup(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        showToast("Account created successfully!", "success");
        return userCredential.user;
    } catch (error) {
        console.error("Signup error:", error);
        showToast(error.message, "error");
        throw error;
    }
}

export async function emailLogin(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        showToast("Welcome back!", "success");
        return userCredential.user;
    } catch (error) {
        console.error("Login error:", error);
        showToast("Invalid credentials", "error");
        throw error;
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
