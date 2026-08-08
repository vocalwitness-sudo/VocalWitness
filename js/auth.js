// js/auth.js - Auth Handler with Profile Cache Sync & Verified State Guards
import {
    signInWithPopup,
    GoogleAuthProvider,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import { auth, provider, db } from './firebase-config.js';
import { doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { updateAppState } from './app-state.js';
import { applyTierTheme, updateTierBadge, clearProfileCache } from './tier.js';
import { initNotifications } from './notifications.js';

let authActionInProgress = false;

// ====================== TIER & USER HELPERS ======================
function refreshTierUI() {
    clearProfileCache();
    if (typeof window.refreshTierAndUI === 'function') {
        window.refreshTierAndUI();
    } else {
        if (typeof applyTierTheme === 'function') applyTierTheme();
        if (typeof updateTierBadge === 'function') updateTierBadge();
    }
}

async function createOrUpdateUser(user) {
    if (!user || !user.uid) return;
    try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        const safeEmail = user.email || "";
        const safeDisplayName = user.displayName || "Anonymous Witness";
        const safePhotoURL = user.photoURL || "";

        if (!snap.exists()) {
            await setDoc(userRef, {
                uid: user.uid,
                email: safeEmail,
                displayName: safeDisplayName,
                photoURL: safePhotoURL,
                tier: "citizen",
                createdAt: serverTimestamp(),
                lastActive: serverTimestamp()
            });
        } else {
            const existingData = snap.data() || {};
            await setDoc(userRef, {
                email: safeEmail || existingData.email || "",
                displayName: safeDisplayName || existingData.displayName || "Anonymous Witness",
                photoURL: safePhotoURL || existingData.photoURL || "",
                lastActive: serverTimestamp()
            }, { merge: true });
        }
    } catch (e) {
        console.error("User document update error:", e);
    }
}

export function savePendingDraft() {
    const mainInput = document.getElementById('mainInput') || document.getElementById('squareSearchInput');
    if (mainInput && mainInput.value.trim() !== '') {
        sessionStorage.setItem('vocal_pending_draft', mainInput.value);
        showToast("Draft saved. We'll restore it after sign-in.", "info");
    }
}

export function restorePendingDraft() {
    const draft = sessionStorage.getItem('vocal_pending_draft');
    if (!draft) return;

    let attempts = 0;
    const interval = setInterval(() => {
        const mainInput = document.getElementById('mainInput') || document.getElementById('squareSearchInput');
        if (mainInput) {
            mainInput.value = draft;
            showToast("✅ Your testimony draft has been restored!", "success");
            sessionStorage.removeItem('vocal_pending_draft');
            clearInterval(interval);
        } else if (++attempts > 10) {
            clearInterval(interval);
        }
    }, 200);
}

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

export async function googleLogin(event) {
    if (event) event.preventDefault();

    if (authActionInProgress) {
        showToast("Sign-in already in progress...", "info");
        return;
    }

    const btn = event?.currentTarget || document.getElementById('googleAuthBtn') || document.getElementById('googleSignInBtn');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    authActionInProgress = true;

    try {
        savePendingDraft();
        showToast("Opening Google Sign-In...", "info");

        const result = await signInWithPopup(auth, provider);

        if (result && result.user) {
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
        if (btn) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

export async function handleEmailAuth(event) {
    if (event) event.preventDefault();

    const submitBtn = event?.submitter || document.getElementById('signInSubmitBtn') || event?.target?.querySelector('button[type="submit"]');
    if (submitBtn?.disabled) return;

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

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
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

        showToast("✅ Signed in successfully!", "success");
        closeLoginModal();
        closeCreateAccountModal();
        restorePendingDraft();

    } catch (error) {
        console.error("Email sign-in error:", error);
        showToast(handleAuthError(error), "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

export async function handleEmailSignUp(event) {
    if (event) event.preventDefault();

    const submitBtn = event?.submitter || document.getElementById('signUpSubmitBtn') || event?.target?.querySelector('button[type="submit"]');
    if (submitBtn?.disabled) return;

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

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    try {
        savePendingDraft();

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await sendEmailVerification(user);
        await signOut(auth);

        showToast("🎉 Account created! A verification link has been sent to your email.", "success");

        closeLoginModal();
        closeCreateAccountModal();
    } catch (error) {
        console.error("Email sign-up error:", error);
        showToast(handleAuthError(error), "error");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

export async function logout() {
    try {
        clearProfileCache();
        if (typeof initNotifications === 'function') {
            initNotifications(null);
        }
        await signOut(auth);
        updateAppState({ isAuthenticated: false, currentUser: null });
        showToast("Signed out successfully", "success");
        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null } }));
        updateUIForAuthState(null);
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

export function requireAuth(message = "Please sign in to proceed.") {
    if (!auth.currentUser) {
        savePendingDraft();
        showToast(message, "info");

        const modalMsg = document.getElementById('loginModalMessage');
        if (modalMsg) modalMsg.textContent = message;
        showAuthModal();
        return false;
    }
    return true;
}

export function updateUIForAuthState(userParam = null) {
    const activeUser = userParam || auth.currentUser;
    const isLoggedIn = !!activeUser;
    
    const guestBtn = document.getElementById('guest-action-btn');
    const profileBtn = document.getElementById('profile-btn');
    const signInElement = document.getElementById('signin-btn');
    const privateElements = document.querySelectorAll('.requires-auth');

    if (guestBtn) guestBtn.classList.toggle('hidden', isLoggedIn);
    if (signInElement) signInElement.classList.toggle('hidden', isLoggedIn);
    if (profileBtn) profileBtn.classList.toggle('hidden', !isLoggedIn);

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

// ====================== MODAL CONTROL HELPERS ======================

export function showAuthModal() {
    const mainAuthModal = document.getElementById('authModal');
    const createModal = document.getElementById('createAccountModal');
    const loginModal = document.getElementById('loginModal');

    if (mainAuthModal) {
        mainAuthModal.classList.remove('hidden');
        mainAuthModal.classList.add('flex');
    } else if (createModal && !createModal.classList.contains('flex')) {
        createModal.classList.remove('hidden');
        createModal.classList.add('flex');
    } else if (loginModal) {
        loginModal.classList.remove('hidden');
        loginModal.classList.add('flex');
    }
}

export function closeLoginModal() {
    const modals = document.querySelectorAll('#authModal, #loginModal, #createAccountModal');
    modals.forEach(modal => {
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
        }
    });
}

export function closeCreateAccountModal() {
    closeLoginModal();
}

export function hideAuthModal() {
    closeLoginModal();
}

/**
 * Safely attach event listeners without throwing when element is null or dataset is missing.
 */
function addSingleEventListener(element, event, handler) {
    if (!element || !element.dataset) return;
    const key = `bound_${event}`;
    if (element.dataset[key]) return;

    element.addEventListener(event, handler);
    element.dataset[key] = "true";
}

// ====================== BIND HEADER & AUTH EVENTS ======================
export function bindHeaderEvents() {
    // 1. Desktop & Mobile Sign In Buttons
    const guestBtns = document.querySelectorAll('#guest-action-btn, #signin-btn-mobile, [data-action="open-auth-modal"]');
    guestBtns.forEach(btn => {
        addSingleEventListener(btn, 'click', (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            showAuthModal();
        });
    });

    // 2. Google Sign-In
    const googleBtns = document.querySelectorAll('#googleAuthBtn, #googleSignInBtn, [data-action="google-login"]');
    googleBtns.forEach(btn => {
        addSingleEventListener(btn, 'click', (e) => {
            e.preventDefault();
            googleLogin(e);
        });
    });

    // 3. Email Auth Forms
    const signInForm = document.getElementById('signInForm') || document.getElementById('loginForm');
    if (signInForm) {
        addSingleEventListener(signInForm, 'submit', (e) => {
            e.preventDefault();
            handleEmailAuth(e);
        });
    }

    const signUpForm = document.getElementById('signUpForm') || document.getElementById('createAccountForm');
    if (signUpForm) {
        addSingleEventListener(signUpForm, 'submit', (e) => {
            e.preventDefault();
            handleEmailSignUp(e);
        });
    }

    // 4. Modal Close Triggers
    const closeBtns = document.querySelectorAll('[data-action="close-auth-modal"], .close-modal-btn');
    closeBtns.forEach(btn => {
        addSingleEventListener(btn, 'click', (e) => {
            e.preventDefault();
            closeLoginModal();
        });
    });

    // 5. Password Visibility Toggles
    const toggleBtns = document.querySelectorAll('[data-action="toggle-password"]');
    toggleBtns.forEach(btn => {
        addSingleEventListener(btn, 'click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            if (targetId) togglePasswordVisibility(targetId, btn);
        });
    });

    // 6. Logout Trigger
    const logoutBtn = document.getElementById('logoutBtn') || document.getElementById('logout-btn');
    if (logoutBtn) {
        addSingleEventListener(logoutBtn, 'click', (e) => {
            e.preventDefault();
            logout();
        });
    }
}

// ====================== AUTH INITIALIZATION ======================
export function initAuth() {
    return new Promise((resolve) => {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                updateAppState({ isAuthenticated: true, currentUser: user });
                await createOrUpdateUser(user);
                refreshTierUI();
                
                if (typeof initNotifications === 'function') {
                    initNotifications(user.uid);
                }
            } else {
                updateAppState({ isAuthenticated: false, currentUser: null });
                if (typeof initNotifications === 'function') {
                    initNotifications(null);
                }
            }

            updateUIForAuthState(user);
            window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
            resolve(user);
        });
    });
}

// Export globals to window for inline onclick attributes if needed
window.showAuthModal = showAuthModal;
window.closeLoginModal = closeLoginModal;
window.logout = logout;
window.googleLogin = googleLogin;
