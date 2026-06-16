import { auth, provider, db } from './firebase-config.js';
import {
    signInWithRedirect,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    getRedirectResult
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
    
    if (!userSnap.exists()) {
        await setDoc(userRef, {
            email: user.email,
            displayName: user.displayName || user.email?.split('@')[0],
            photoURL: user.photoURL,
            role: "admin",
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

    // Handle return from Google redirect
    getRedirectResult(auth).then((result) => {
        if (result?.user) {
            syncUserToFirestore(result.user);
            showToast("Welcome to VocalWitness!", "success");
        }
    }).catch((error) => {
        if (error.code !== 'auth/redirect-cancelled-by-user') {
            console.error("Redirect result error:", error);
        }
    });
}

function updateAuthUI(user) {
    const profileBtn = document.getElementById('btn-profile');
    const logoutBtn = document.getElementById('btn-logout');
   
    if (user) {
        if (profileBtn) profileBtn.textContent = "👤 " + (user.displayName || user.email?.split('@')[0] || "Profile");
        if (logoutBtn) logoutBtn.textContent = "Sign Out";
    } else {
        if (profileBtn) profileBtn.textContent = "👤 Profile";
        if (logoutBtn) logoutBtn.textContent = "Sign In";
    }
}

export async function googleLogin() {
    try {
        console.log("🚀 Starting Google Sign In (Redirect)...");
        await signInWithRedirect(auth, provider);
    } catch (error) {
        console.error("Google login error:", error);
        showToast("Login failed: " + (error.message || error.code), "error");
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
