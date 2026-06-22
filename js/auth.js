// js/auth.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
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

// Initialize Firebase
let app, auth, provider, db;

function initFirebase() {
    if (!app) {
        const firebaseConfig = {
            apiKey: "YOUR_API_KEY",
            authDomain: "YOUR_PROJECT.firebaseapp.com",
            projectId: "YOUR_PROJECT",
            storageBucket: "YOUR_PROJECT.appspot.com",
            messagingSenderId: "YOUR_SENDER_ID",
            appId: "YOUR_APP_ID"
        };
        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        provider = new GoogleAuthProvider();
        db = getFirestore(app);
    }
    return { auth, provider, db };
}

const { auth: authInstance, provider: googleProvider, db: firestoreDb } = initFirebase();
export { authInstance as auth };
export { googleProvider as provider };
export { firestoreDb as db };

// ==================== APP CHECK ====================
function initAppCheck() {
    try {
        console.log("🛡️ App Check initialized (placeholder)");
    } catch (e) {
        console.warn("App Check skipped:", e.message);
    }
}

// Sync user to Firestore
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
        await setDoc(userRef, { lastLogin: new Date().toISOString() }, { merge: true });
    }
}

export function initAuth() {
    console.log("🔐 Initializing Authentication...");
    initAppCheck();

    onAuthStateChanged(auth, async (user) => {
        console.log("🔐 Auth state changed:", user ? user.email : "Guest");
        if (user) {
            await syncUserToFirestore(user);
        }
        updateUser(user);
        updateAuthUI(user);
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
    });

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
        await signInWithRedirect(auth, googleProvider);
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
        
        // Update user profile in Firestore
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
