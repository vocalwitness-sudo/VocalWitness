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

export function initAuth() {
    onAuthStateChanged(auth, (user) => {
        console.log("🔐 Auth state:", user ? user.email : "Guest");

        const event = new CustomEvent('auth-changed', { 
            detail: { user } 
        });
        window.dispatchEvent(event);

        // Update UI
        updateAuthUI(user);
    });
}

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

export async function googleLogin() {
    try {
        const result = await signInWithPopup(auth, provider);
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
        console.log("✅ New user created:", userCredential.user.email);
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
        console.log("✅ Email login successful:", userCredential.user.email);
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
