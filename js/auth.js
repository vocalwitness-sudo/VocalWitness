// js/auth.js
import { auth, provider, db } from './firebase-config.js'; // Ensure db is exported from your config
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import { showToast } from "./utils.js";
import { updateUser } from './storage.js';

/**
 * Syncs user to Firestore on first login
 */
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
            role: "admin", // Sets user as admin
            createdAt: new Date().toISOString()
        });
        console.log("✅ User synced to Firestore");
    }
}

export function initAuth() {
    onAuthStateChanged(auth, (user) => {
        console.log("🔐 Auth state:", user ? user.email : "Guest");
        updateUser(user);

        const event = new CustomEvent('auth-changed', { detail: { user } });
        window.dispatchEvent(event);
        updateAuthUI(user);
    });
}

function updateAuthUI(user) {
    const profileBtn = document.getElementById('btn-profile');
    const logoutBtn = document.getElementById('btn-logout');
    
    if (user) {
        if (profileBtn) profileBtn.textContent = "👤 " + (user.displayName || user.email || "Profile");
        if (logoutBtn) logoutBtn.textContent = "Logout";   // ← Change this
    } else {
        if (profileBtn) profileBtn.textContent = "👤 Profile";
        if (logoutBtn) logoutBtn.textContent = "Sign In";
    }
}

export async function googleLogin() {
    try {
        const result = await signInWithPopup(auth, provider);
        
        // Call the sync function immediately after login
        await syncUserToFirestore(result.user);
        
        console.log("✅ Google Sign In:", result.user.email);
        showToast("Welcome to VocalWitness!", "success");
    } catch (error) {
        console.error("Google login error:", error);
        showToast("Login failed: " + error.message, "error");
    }
}

export async function emailSignup(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await syncUserToFirestore(userCredential.user);
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
