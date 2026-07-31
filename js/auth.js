// ====================== IMPORTS ======================
import {
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendEmailVerification
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import { auth, provider, db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { updateAppState } from './app-state.js';
import { applyTierTheme, updateTierBadge } from './tier.js';

let authActionInProgress = false;

// ====================== TIER & USER HELPERS ======================
function refreshTierUI() {
    if (typeof window.refreshTierAndUI === 'function') {
        window.refreshTierAndUI();
    } else {
        if (typeof applyTierTheme === 'function') applyTierTheme();
        if (typeof updateTierBadge === 'function') updateTierBadge();
    }
}

async function createOrUpdateUser(user) {
    if (!user) return;
    try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (!snap.exists()) {
            // First-time user setup
            await setDoc(userRef, {
                uid: user.uid,
                email: user.email || "",
                displayName: user.displayName || "Anonymous Witness",
                photoURL: user.photoURL || "",
                tier: "citizen",
                createdAt: serverTimestamp(),
                lastActive: serverTimestamp()
            });
        } else {
            // Existing user: preserve tier, update activity timestamp
            await setDoc(userRef, {
                email: user.email || snap.data().email || "",
                displayName: user.displayName || snap.data().displayName || "Anonymous Witness",
                photoURL: user.photoURL || snap.data().photoURL || "",
                lastActive: serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {
        console.error("User document error:", e);
    }
}

// ====================== DRAFT & STATE PRESERVATION ======================
export function savePendingDraft() {
    const mainInput = document.getElementById('mainInput');
    if (mainInput && mainInput.value.trim() !== '') {
        sessionStorage.setItem('vocal_pending_draft', mainInput.value);
        showToast("Draft saved. We'll restore it after sign-in.", "info");
    }
}

export function restorePendingDraft() {
    const draft = sessionStorage.getItem('vocal_pending_draft');
    if (draft) {
        setTimeout(() => {
            const mainInput = document.getElementById('mainInput');
            if (mainInput) {
                mainInput.value = draft;
                showToast("✅ Your testimony draft has been restored!", "success");
            }
            sessionStorage.removeItem('vocal_pending_draft');
        }, 100);
    }
}

// ====================== FIREBASE AUTH ERROR MAPPER ======================
function handleAuthError(error) {
    switch (error?.code) {
        case 'auth/invalid-credential':
            return "Invalid email or password. If you just created an account, please check your email for the verification link first.";
        case 'auth/too-many-requests':
            return "Too many attempts. For security, please wait a few minutes before trying again.";
        case 'auth/invalid-phone-number':
            return "The phone number format is invalid. Please include your correct country code.";
        case 'auth/quota-exceeded':
            return "SMS service temporarily busy. Please try an alternate verification path.";
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            return "Sign-in was cancelled.";
        case 'auth/popup-blocked':
            return "Popup was blocked by browser. Please allow popups for this site.";
        case 'auth/invalid-email':
            return "The email address format is invalid.";
        case 'auth/user-not-found':
            return "No account found with this email address. Please check or sign up.";
        case 'auth/wrong-password':
            return "Incorrect password. Please try again.";
        case 'auth/email-already-in-use':
            return "An account with this email already exists. Try signing in instead.";
        case 'auth/weak-password':
            return "Password should be at least 6 characters long.";
        default:
            return error?.message || "Authentication failed. Please check your connection.";
    }
}

// ====================== AUTH METHODS - GOOGLE POPUP LOGIC ======================
export async function googleLogin() {
    if (authActionInProgress) {
        showToast("Sign-in already in progress...", "info");
        return;
    }

    authActionInProgress = true;

    try {
        savePendingDraft();
        showToast("Opening Google Sign-In...", "info");

        const result = await signInWithPopup(auth, provider);

        if (result && result.user) {
            const user = result.user;
            await createOrUpdateUser(user);
            updateAppState({ isAuthenticated: true, currentUser: user });
            refreshTierUI();

            if (typeof window.updateHeaderButtons === 'function') {
                window.updateHeaderButtons(true);
            }

            window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
            updateUIForAuthState();

            showToast("✅ Signed in successfully!", "success");

            closeLoginModal();
            closeCreateAccountModal();
            restorePendingDraft();
        }
    } catch (error) {
        console.error("Google popup sign-in error:", error);
        showToast(handleAuthError(error), "error");
    } finally {
        authActionInProgress = false;
    }
}

// ====================== EMAIL SIGN-IN & SIGN-UP ======================
export async function handleEmailAuth(event) {
    if (event) event.preventDefault();

    const email = (
        document.getElementById('authEmail')?.value ||
        document.getElementById('signInEmail')?.value ||
        document.getElementById('signUpEmail')?.value
    )?.trim();

    const password = (
        document.getElementById('authPassword')?.value ||
        document.getElementById('signInPassword')?.value ||
        document.getElementById('signUpPassword')?.value
    );

    if (!email || !password) {
        showToast("Please enter both email and password.", "error");
        return;
    }

    try {
        savePendingDraft();

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (!user.emailVerified) {
            showToast("⚠️ Email unverified. Please check your inbox for the verification link.", "warning");
            await signOut(auth);
            return;
        }

        await createOrUpdateUser(user);
        updateAppState({ isAuthenticated: true, currentUser: user });
        refreshTierUI();

        if (typeof window.updateHeaderButtons === 'function') {
            window.updateHeaderButtons(true);
        }

        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
        updateUIForAuthState();

        showToast("✅ Signed in successfully!", "success");
        closeLoginModal();
        closeCreateAccountModal();
        restorePendingDraft();

    } catch (error) {
        console.error("Email sign-in error:", error);
        showToast(handleAuthError(error), "error");
    }
}

export async function handleEmailSignUp(event) {
    if (event) event.preventDefault();
    const email = (document.getElementById('authEmail')?.value || document.getElementById('signUpEmail')?.value)?.trim();
    const password = document.getElementById('authPassword')?.value || document.getElementById('signUpPassword')?.value;

    if (!email || !password) {
        showToast("Please enter both email and password.", "error");
        return;
    }

    if (password.length < 6) {
        showToast("Password must be at least 6 characters long.", "error");
        return;
    }

    try {
        savePendingDraft();

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await sendEmailVerification(user);
        await signOut(auth); // Sign out immediately to enforce email verification flow

        showToast("🎉 Account created! A verification link has been sent to your email.", "success");

        closeLoginModal();
        closeCreateAccountModal();
    } catch (error) {
        console.error("Email sign-up error:", error);
        showToast(handleAuthError(error), "error");
    }
}

export async function logout() {
    try {
        await signOut(auth);
        updateAppState({ isAuthenticated: false, currentUser: null });
        showToast("Signed out successfully", "success");
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null } }));
        updateUIForAuthState();
    } catch (error) {
        console.error("Logout error:", error);
        showToast("Logout failed", "error");
    }
}

export function togglePasswordVisibility(inputId, btnElement) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPassword = input.type === 'password';
    input.type = isPassword ? 'text' : 'password';
    if (btnElement) {
        btnElement.textContent = isPassword ? 'Hide' : 'Show';
    }
}

// ====================== REQUIRE AUTH ======================
export function requireAuth(message = "Please sign in to proceed.") {
    if (!auth.currentUser) {
        savePendingDraft();
        showToast(message, "info");

        const loginModal = document.getElementById('loginModal');
        const modalMsg = document.getElementById('loginModalMessage');
        if (modalMsg) modalMsg.textContent = message;
        if (loginModal) loginModal.classList.remove('hidden');
        return false;
    }
    return true;
}

// ====================== UI SYNC FOR HYBRID READ/WRITE MODEL ======================
export function updateUIForAuthState() {
    const isLoggedIn = !!auth.currentUser;
    const guestBtn = document.getElementById('guest-action-btn');
    const profileBtn = document.getElementById('profile-btn');
    const signInElement = document.getElementById('signin-btn');
    const privateElements = document.querySelectorAll('.requires-auth');

    if (guestBtn) {
        guestBtn.classList.toggle('hidden', isLoggedIn);
    }

    if (signInElement) {
        signInElement.classList.toggle('hidden', isLoggedIn);
    }

    if (profileBtn) {
        profileBtn.classList.toggle('hidden', !isLoggedIn);
    }

    privateElements.forEach(el => {
        el.classList.toggle('hidden', !isLoggedIn);
    });

    document.querySelectorAll('#postButton, #btn-photo, #btn-voice').forEach(btn => {
        if (btn) btn.style.opacity = isLoggedIn ? '1' : '0.6';
    });

    if (typeof window.updateHeaderButtons === 'function') {
        window.updateHeaderButtons(isLoggedIn);
    }
}

// ====================== INIT AUTH ======================
export function initAuth() {
    auth.onAuthStateChanged(async (user) => {
        if (user && user.emailVerified) {
            await createOrUpdateUser(user);
            updateAppState({ isAuthenticated: true, currentUser: user });
            refreshTierUI();
        } else {
            updateAppState({ isAuthenticated: false, currentUser: null });
        }

        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: (user && user.emailVerified) ? user : null } }));
        updateUIForAuthState();
    });

    document.addEventListener('click', (e) => {
        if (e.target.matches('#logoutBtn, .btn-logout, [data-action="logout"]')) {
            e.preventDefault();
            logout();
        }
    });

    updateUIForAuthState();
    console.log("🔐 Auth initialized (Popup Mode)");
}

// ====================== MODAL & GLOBAL EXPOSURES ======================
export function showAuthModal() {
    if (auth.currentUser) {
        if (typeof window.showProfile === 'function') {
            window.showProfile();
        } else if (typeof window.openProfile === 'function') {
            window.openProfile();
        } else {
            console.warn("Profile opener function not defined yet.");
        }
    } else {
        const createModal = document.getElementById('createAccountModal');
        if (createModal) {
            createModal.classList.remove('hidden');
        } else {
            const loginModal = document.getElementById('loginModal');
            if (loginModal) loginModal.classList.remove('hidden');
        }
    }
}

export function closeLoginModal() {
    const loginModal = document.getElementById('loginModal');
    if (loginModal) loginModal.classList.add('hidden');
}

export function closeCreateAccountModal() {
    const createModal = document.getElementById('createAccountModal');
    if (createModal) createModal.classList.add('hidden');
}

// Global exposures for inline HTML handlers
window.googleLogin = googleLogin;
window.handleEmailAuth = handleEmailAuth;
window.handleEmailSignUp = handleEmailSignUp;
window.logout = logout;
window.togglePasswordVisibility = togglePasswordVisibility;
window.requireAuth = requireAuth;
window.updateUIForAuthState = updateUIForAuthState;
window.showAuthModal = showAuthModal;
window.closeLoginModal = closeLoginModal;
window.closeCreateAccountModal = closeCreateAccountModal;
