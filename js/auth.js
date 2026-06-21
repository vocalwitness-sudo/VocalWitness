// js/auth.js
import { auth, provider, db } from './firebase-config.js';
import {
    signInWithRedirect,
    signOut,
    onAuthStateChanged,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    getRedirectResult,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider,
    RecaptchaVerifier,
    signInWithPhoneNumber
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from "./utils.js";
import { updateUser } from './storage.js';

// ==================== APP CHECK (Anti-Abuse) ====================
function initAppCheck() {
    try {
        // Replace with your actual reCAPTCHA v3 Site Key from Google
        const appCheck = initializeAppCheck(auth.app, {
            provider: new ReCaptchaV3Provider('6Ld76yktAAAAAPmdJpO4jayNIgF7OLWe0AHjsk1Y'),
            isTokenAutoRefreshEnabled: true
        });
        console.log("🛡️ Firebase App Check initialized");
    } catch (e) {
        console.warn("App Check initialization skipped (non-critical):", e.message);
    }
}

/**
 * Sync new user to Firestore
 */
async function syncUserToFirestore(user) {
    if (!user) return;
    const userRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
        await setDoc(userRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || user.email?.split('@')[0] || "Citizen",
            username: user.email?.split('@')[0] || `user_${Date.now()}`,
            photoURL: user.photoURL || "",
            role: "citizen",
            trustCircle: 50,
            reputationScore: 50,
            createdAt: new Date().toISOString(),
            lastLogin: new Date().toISOString()
        });
        console.log("✅ New user synced to Firestore");
    } else {
        // Update last login
        await setDoc(userRef, { lastLogin: new Date().toISOString() }, { merge: true });
    }
}

export function initAuth() {
    console.log("🔐 Initializing Authentication...");

    // Initialize App Check
    initAppCheck();

    // Auth State Listener
    onAuthStateChanged(auth, async (user) => {
        console.log("🔐 Auth state changed:", user ? user.email : "Guest");
        
        if (user) {
            await syncUserToFirestore(user);
        }
        
        updateUser(user);
        updateAuthUI(user);

        // Dispatch global event
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
    });

    // Handle Google Redirect Result
    getRedirectResult(auth).then((result) => {
        if (result?.user) {
            showToast("Welcome to VocalWitness! 🎉", "success");
        }
    }).catch((error) => {
        if (error.code !== 'auth/redirect-cancelled-by-user') {
            console.error("Redirect result error:", error);
        }
    });
}

function updateAuthUI(user) {
    const profileBtn = document.getElementById('btn-profile');
    if (profileBtn) {
        profileBtn.textContent = user 
            ? `👤 ${user.displayName || user.email?.split('@')[0] || "Profile"}` 
            : "👤 Profile";
    }
}

// ==================== LOGIN METHODS ====================
export async function googleLogin() {
    try {
        await signInWithRedirect(auth, provider);
    } catch (error) {
        console.error("Google login error:", error);
        showToast("Google Sign-In failed: " + error.message, "error");
    }
}

export async function emailSignup(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        showToast("Account created successfully! 🎉", "success");
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
        showToast("Welcome back! 👋", "success");
        return userCredential.user;
    } catch (error) {
        console.error("Login error:", error);
        showToast("Invalid email or password", "error");
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

// ==================== PASSWORD MANAGEMENT ====================
export async function changePassword(currentPassword, newPassword) {
    try {
        const user = auth.currentUser;
        if (!user?.email) throw new Error("This feature is only for email/password accounts");

        const credential = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(user, credential);
        await updatePassword(user, newPassword);

        showToast("✅ Password changed successfully!", "success");
        return true;
    } catch (error) {
        console.error("Change password error:", error);
        if (error.code === "auth/wrong-password") {
            showToast("Current password is incorrect", "error");
        } else {
            showToast(error.message, "error");
        }
        return false;
    }
}

// ==================== PHONE VERIFICATION ====================
let recaptchaVerifier;

export function initRecaptcha() {
    if (recaptchaVerifier) recaptchaVerifier.clear();

    recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => console.log("✅ reCAPTCHA verified"),
        'expired-callback': () => console.warn("reCAPTCHA expired")
    });
}

export async function sendPhoneVerification(phoneNumber) {
    try {
        if (!recaptchaVerifier) initRecaptcha();
        
        const confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
        window.confirmationResult = confirmationResult;
        
        showToast("✅ Verification code sent to your phone", "success");
        return true;
    } catch (error) {
        console.error("Phone verification error:", error);
        showToast("Failed to send code: " + error.message, "error");
        return false;
    }
}

export async function verifyPhoneCode(code) {
    try {
        if (!window.confirmationResult) throw new Error("No verification session active");

        const result = await window.confirmationResult.confirm(code);

        // Update user profile
        const userRef = doc(db, "users", result.user.uid);
        await setDoc(userRef, {
            isPhoneVerified: true,
            phoneNumber: result.user.phoneNumber,
            phoneVerifiedAt: new Date().toISOString()
        }, { merge: true });

        showToast("✅ Phone verified! Trust Score increased.", "success");
        return true;
    } catch (error) {
        console.error("Code verification failed:", error);
        showToast("Invalid or expired code", "error");
        return false;
    }
}
