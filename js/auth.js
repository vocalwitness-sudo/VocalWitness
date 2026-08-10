// js/auth.js - Auth Handler with Profile Cache Sync & Verified State Guards
import {
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
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
                isVerified: false,
                verificationType: null,
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

            // Sync Verification UI based on user profile state
            updateVerificationUI(existingData.isVerified || false);
        }
    } catch (e) {
        console.error("User document update error:", e);
    }
}

// Update account verification indicators across the modal UI
export function updateVerificationUI(isVerified = false) {
    const statusEl = document.getElementById('verification-status');
    const verifyBtn = document.getElementById('request-verification-btn');

    if (statusEl) {
        if (isVerified) {
            statusEl.className = "inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-lg border border-emerald-400/20";
            statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Verified Citizen`;
        } else {
            statusEl.className = "inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-lg border border-amber-400/20";
            statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span> Unverified`;
        }
    }

    if (verifyBtn) {
        if (isVerified) {
            verifyBtn.textContent = "Verified";
            verifyBtn.disabled = true;
            verifyBtn.classList.add("opacity-50", "cursor-not-allowed");
        } else {
            verifyBtn.textContent = "Get Verified";
            verifyBtn.disabled = false;
            verifyBtn.classList.remove("opacity-50", "cursor-not-allowed");
        }
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
            return null; // Silent cancel handling
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
        case 'auth/missing-initial-state':
            return "Browser privacy rules prevented automatic state recovery. Redirecting...";
        default:
            return error?.message || "Authentication failed. Please check your connection.";
    }
}

export async function googleLogin(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    // STRICT GUARD: Block double executions instantly
    if (authActionInProgress) {
        console.warn("⚠️ Auth action already in progress. Ignoring duplicate trigger.");
        return;
    }

    authActionInProgress = true;

    const btn = event?.currentTarget || document.getElementById('googleAuthBtn') || document.getElementById('googleSignInBtn');
    if (btn) {
        btn.disabled = true;
        btn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    try {
        provider.setCustomParameters({ prompt: 'select_account' });

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.matchMedia('(display-mode: standalone)').matches;

        try { savePendingDraft(); } catch (e) {}

        if (isMobile) {
            await signInWithRedirect(auth, provider);
            return;
        }

        // Execute popup cleanly
        const result = await signInWithPopup(auth, provider);

        if (result && result.user) {
            showToast("✅ Signed in successfully!", "success");
            closeLoginModal();
            closeCreateAccountModal();
            restorePendingDraft();
        }
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
            console.info("User closed Google login popup or request was cancelled.");
            return;
        }

        if (error.code === 'auth/popup-blocked') {
            showToast("⚠️ Sign-in popup was blocked by browser. Please allow popups.", "warning");
            return;
        }

        console.error("Google login error:", error);
        const errMsg = handleAuthError(error);
        if (errMsg) showToast(errMsg, "error");
    } finally {
        setTimeout(() => {
            authActionInProgress = false;
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }, 600);
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
        const errMsg = handleAuthError(error);
        if (errMsg) showToast(errMsg, "error");
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
        const errMsg = handleAuthError(error);
        if (errMsg) showToast(errMsg, "error");
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
        updateVerificationUI(false);
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

// Verification Modal Helpers
export function openVerificationModal() {
    if (!requireAuth("Please sign in to complete citizen verification.")) return;
    const modal = document.getElementById('verificationModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }
}

export function closeVerificationModal() {
    const modal = document.getElementById('verificationModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
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

export function toggleProfileMenu(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation(); // Prevents document click from immediately closing it
    }
    const profileMenu = document.getElementById('profile-menu') || document.getElementById('user-dropdown');
    if (profileMenu) {
        profileMenu.classList.toggle('hidden');
    }
}

// ====================== BIND HEADER & AUTH EVENTS ======================
export function bindHeaderEvents() {
    // 1. Desktop & Mobile Sign In Buttons
    const guestBtns = document.querySelectorAll('#guest-action-btn, #signin-btn-mobile, [data-action="open-auth-modal"]');
    guestBtns.forEach(btn => {
        addSingleEventListener(btn, 'click', (e) => {
            e.preventDefault();
            showAuthModal();
        });
    });

   // 2. Profile Button — open the actual profile modal
const profileBtns = document.querySelectorAll(
    '#profile-btn, #profile-btn-mobile, #mobile-profile-nav-btn, [data-action="open-profile"], [data-action="toggle-profile-menu"]'
);
profileBtns.forEach(btn => {
    addSingleEventListener(btn, 'click', (e) => {
        e.preventDefault();
        if (typeof window.openProfile === 'function') {
            window.openProfile();
        } else {
            const modal = document.getElementById('profileModal');
            if (modal) modal.classList.remove('hidden');
        }
    });
});

    // 3. Global Dropdown Close Handler (Click outside)
    if (!window.__dropdownClickListenerBound) {
        document.addEventListener('click', (e) => {
            const isDropdownClick = e.target.closest('#profile-btn') || 
                                    e.target.closest('[data-action="toggle-profile-menu"]') || 
                                    e.target.closest('#profile-menu') || 
                                    e.target.closest('#user-dropdown') || 
                                    e.target.closest('.dropdown-container');
            if (!isDropdownClick) {
                document.querySelectorAll('#profile-menu, #user-dropdown, .dropdown-menu').forEach(el => {
                    el.classList.add('hidden');
                });
            }
        });
        window.__dropdownClickListenerBound = true;
    }

    // 4. Google Sign-In (Deduplicated)
    const rawGoogleBtns = document.querySelectorAll('#googleAuthBtn, #googleSignInBtn, [data-action="google-login"]');
    const googleBtns = Array.from(new Set(rawGoogleBtns));

    googleBtns.forEach(btn => {
        addSingleEventListener(btn, 'click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            googleLogin(e);
        });
    });
    
 // 5. Email Auth Forms — match the REAL HTML IDs
const emailAuthForm = document.getElementById('emailAuthForm');
if (emailAuthForm) {
    addSingleEventListener(emailAuthForm, 'submit', (e) => {
        e.preventDefault();
        handleEmailAuth(e);
    });
}

// Create Account is type="button", so it needs its own click handler
const emailSignUpBtn = document.getElementById('emailSignUpBtn');
if (emailSignUpBtn) {
    addSingleEventListener(emailSignUpBtn, 'click', (e) => {
        e.preventDefault();
        handleEmailSignUp(e);
    });
}

// Also keep legacy form IDs just in case
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
    // 6. Modal Close Triggers
    const closeBtns = document.querySelectorAll('[data-action="close-auth-modal"], .close-modal-btn');
    closeBtns.forEach(btn => {
        addSingleEventListener(btn, 'click', (e) => {
            e.preventDefault();
            closeLoginModal();
        });
    });

    // 7. Password Visibility Toggles
    const toggleBtns = document.querySelectorAll('[data-action="toggle-password"]');
    toggleBtns.forEach(btn => {
        addSingleEventListener(btn, 'click', (e) => {
            e.preventDefault();
            const targetId = btn.getAttribute('data-target');
            if (targetId) togglePasswordVisibility(targetId, btn);
        });
    });

    // 8. Logout — cover common IDs + event delegation for dynamic profile content
const logoutBtn = document.getElementById('logoutBtn') || document.getElementById('logout-btn');
if (logoutBtn) {
    addSingleEventListener(logoutBtn, 'click', (e) => {
        e.preventDefault();
        logout();
    });
}

// Catch logout buttons that are injected later into #profileContent
if (!window.__logoutDelegationBound) {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#logoutBtn, #logout-btn, [data-action="logout"], .logout-btn');
        if (btn) {
            e.preventDefault();
            logout();
        }
    });
    window.__logoutDelegationBound = true;
}

// ====================== AUTH INITIALIZATION ======================
export function initAuth() {
    return new Promise((resolve) => {
        getRedirectResult(auth)
            .then((result) => {
                if (result?.user) {
                    showToast("✅ Signed in successfully!", "success");
                    closeLoginModal();
                    restorePendingDraft();
                }
            })
            .catch((error) => {
                if (error?.code !== 'auth/missing-initial-state') {
                    console.error("Redirect sign-in error:", error);
                    const errMsg = handleAuthError(error);
                    if (errMsg) showToast(errMsg, "error");
                }
            });

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
                updateVerificationUI(false);
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

// Export globals to window
window.showAuthModal = showAuthModal;
window.closeLoginModal = closeLoginModal;
window.logout = logout;
window.googleLogin = googleLogin;
window.openVerificationModal = openVerificationModal;
window.closeVerificationModal = closeVerificationModal;
window.toggleProfileMenu = toggleProfileMenu;
