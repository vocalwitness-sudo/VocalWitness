// js/auth.js - Auth Handler with Profile Cache Sync & Default Citizen Tier Assignment
import {
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail,
    setPersistence,
    browserLocalPersistence,
    browserSessionPersistence,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { auth, provider, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { updateAppState } from './app-state.js';
import { applyTierTheme, updateTierBadge, clearProfileCache, TIERS } from './tier.js';
import { initNotifications } from './notifications.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let authActionInProgress = false;
let isSignUpMode = false; // false = Sign In, true = Create Account

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
            // Initial creation payload conforming strictly to isSafeUserCreation()
            await setDoc(userRef, {
                uid: user.uid,
                email: safeEmail,
                displayName: safeDisplayName,
                photoURL: safePhotoURL,
                tier: TIERS?.CITIZEN || "citizen",
                isVerified: false,
                isPhoneVerified: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });

            if (typeof updateVerificationUI === 'function') {
                updateVerificationUI(false);
            }
            if (typeof showToast === 'function') {
                showToast("🎉 Account created! Welcome to the Public Square.", "success");
            }
        } else {
            const existingData = snap.data() || {};
            const changes = {};

            // Sync auth profile updates
            if (safeDisplayName && safeDisplayName !== existingData.displayName) {
                changes.displayName = safeDisplayName;
            }
            if (safePhotoURL && safePhotoURL !== existingData.photoURL) {
                changes.photoURL = safePhotoURL;
            }
            if (safeEmail && safeEmail !== existingData.email) {
                changes.email = safeEmail;
            }

            // Populate missing baseline schema values allowed under isSafeUserUpdate()
            if (!existingData.tier) changes.tier = TIERS?.CITIZEN || "citizen";
            if (existingData.isPhoneVerified === undefined) changes.isPhoneVerified = false;

            // Perform write only if actual differences exist
            if (Object.keys(changes).length > 0) {
                changes.updatedAt = serverTimestamp();
                await updateDoc(userRef, changes);
            }

            // Determine verification state for UI render
            const currentIsVerified = changes.isVerified ?? existingData.isVerified ?? false;
            const currentIsPhoneVerified = changes.isPhoneVerified ?? existingData.isPhoneVerified ?? existingData.hasVerifiedPhone ?? false;

            if (typeof updateVerificationUI === 'function') {
                updateVerificationUI(currentIsVerified || currentIsPhoneVerified);
            }
        }
    } catch (e) {
        if (e?.code === 'permission-denied') {
            console.warn("Firestore rules restricted document sync for UID:", user.uid);
        } else {
            console.error("User document update error:", e);
            if (typeof showToast === 'function') {
                showToast("Error configuring user profile in Firestore.", "error");
            }
        }
    }
}
export function updateVerificationUI(isVerified = false) {
    const statusEl = document.getElementById('verification-status');
    const verifyBtn = document.getElementById('request-verification-btn');

    if (statusEl) {
        if (isVerified) {
            statusEl.className = "inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2.5 py-1 rounded-lg border border-emerald-400/20";
            statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Citizen Circle`;
        } else {
            statusEl.className = "inline-flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-400/10 px-2.5 py-1 rounded-lg border border-amber-400/20";
            statusEl.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span> Citizen (Unverified)`;
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
    const mainInput = document.getElementById('mainInput') ||
                      document.getElementById('squareSearchInput') ||
                      document.getElementById('testimonyInput');

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
        const mainInput = document.getElementById('mainInput') ||
                          document.getElementById('squareSearchInput') ||
                          document.getElementById('testimonyInput');

        if (mainInput) {
            mainInput.value = draft;
            showToast("✅ Your testimony draft has been restored!", "success");
            sessionStorage.removeItem('vocal_pending_draft');
            clearInterval(interval);
        } else if (++attempts > 20) {
            clearInterval(interval);
        }
    }, 200);
}

function handleAuthError(error) {
    switch (error?.code) {
        case 'auth/invalid-credential':
            return "Invalid email or password. If you don't have an account, click 'Create Account'.";
        case 'auth/too-many-requests':
            return "Too many attempts. For security, please wait a few minutes before trying again.";
        case 'auth/invalid-phone-number':
            return "The phone number format is invalid. Please include your correct country code.";
        case 'auth/quota-exceeded':
            return "SMS service temporarily busy. Please try an alternate verification path.";
        case 'auth/popup-closed-by-user':
        case 'auth/cancelled-popup-request':
            return null;
        case 'auth/popup-blocked':
            return "Popup was blocked by browser. Switching to redirect...";
        case 'auth/invalid-email':
            return "The email address format is invalid.";
        case 'auth/user-not-found':
            return "No account found with this email. Please click 'Create Account'.";
        case 'auth/wrong-password':
            return "Incorrect password. Please try again or click 'Forgot password?'.";
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

function getAuthInputs(form) {
    if (!form || !(form instanceof HTMLFormElement)) {
        return { emailInput: null, passwordInput: null };
    }

    const isUsable = (el) => {
        if (!el || el.disabled) return false;
        if (el.hidden || el.type === 'hidden' || el.offsetParent === null) return false;
        return true;
    };

    const emailCandidates = [
        ...form.querySelectorAll('input[type="email"]'),
        ...form.querySelectorAll('input[name="email"]'),
        ...form.querySelectorAll('[data-auth="email"]')
    ];

    const passwordCandidates = [
        ...form.querySelectorAll('input[type="password"]'),
        ...form.querySelectorAll('input[name="password"]'),
        ...form.querySelectorAll('[data-auth="password"]')
    ];

    const emailInput = emailCandidates.find(isUsable) || emailCandidates[0] || null;
    const passwordInput = passwordCandidates.find(isUsable) || passwordCandidates[0] || null;

    return { emailInput, passwordInput };
}

// ====================== UI HELPERS FOR AUTH MODAL ======================
function updateAuthModeUI() {
    const title = document.getElementById('authTitle');
    const subtitle = document.getElementById('authSubtitle');
    const submitBtn = document.getElementById('submitAuthBtn');
    const toggleBtn = document.getElementById('toggleAuthModeBtn');
    const forgotBtn = document.getElementById('forgotPasswordBtn');

    if (isSignUpMode) {
        if (title) title.textContent = "Create Account";
        if (subtitle) subtitle.textContent = "Join the Public Square";
        if (submitBtn) submitBtn.textContent = "Create Account";
        if (toggleBtn) toggleBtn.textContent = "Sign In instead";
        if (forgotBtn) forgotBtn.classList.add('hidden');
    } else {
        if (title) title.textContent = "Join the Public Square";
        if (subtitle) subtitle.textContent = "Sign in or create an account to participate.";
        if (submitBtn) submitBtn.textContent = "Sign In";
        if (toggleBtn) toggleBtn.textContent = "Create Account";
        if (forgotBtn) forgotBtn.classList.remove('hidden');
    }
}

function switchToAuthView() {
    const form = document.getElementById('authForm');
    const resetView = document.getElementById('resetPasswordView');
    if (form) form.classList.remove('hidden');
    if (resetView) resetView.classList.add('hidden');
}

function switchToResetView() {
    const form = document.getElementById('authForm');
    const resetView = document.getElementById('resetPasswordView');
    const resetEmail = document.getElementById('resetEmail');
    const loginEmail = document.getElementById('loginEmail');

    if (form) form.classList.add('hidden');
    if (resetView) resetView.classList.remove('hidden');
    if (resetEmail && loginEmail) {
        resetEmail.value = loginEmail.value || '';
    }
}

// ====================== AUTH ACTIONS ======================
export async function googleLogin(event) {
    if (event) {
        event.preventDefault?.();
        event.stopPropagation?.();
    }

    if (authActionInProgress) return;
    authActionInProgress = true;

    const rawTarget = event?.target || event?.currentTarget;
    const btn = (rawTarget && typeof rawTarget.closest === 'function')
        ? rawTarget.closest('button')
        : (document.getElementById('googleAuthBtn') || document.getElementById('googleSignInBtn'));

    if (btn) {
        btn.disabled = true;
        btn.classList?.add('opacity-50', 'cursor-not-allowed');
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
                     window.matchMedia('(display-mode: standalone)').matches;

    try {
        savePendingDraft();

        const remember = document.getElementById('rememberMe')?.checked ?? true;
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

        if (provider?.setCustomParameters) {
            provider.setCustomParameters({ prompt: 'select_account' });
        }

        if (isMobile) {
            await signInWithRedirect(auth, provider);
            return;
        }

        try {
            const userCredential = await signInWithPopup(auth, provider);
            if (userCredential?.user) {
                showToast("✅ Signed in successfully with Google!", "success");
                closeLoginModal();
                restorePendingDraft();
            }
        } catch (popupError) {
            if (popupError.code === 'auth/popup-blocked' || popupError.code === 'auth/popup-closed-by-user') {
                showToast("⚠️ Popup blocked or closed. Switching to redirect...", "info");
                await signInWithRedirect(auth, provider);
                return;
            }
            throw popupError;
        }
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
            return;
        }
        console.error("Google login error:", error);
        const errMsg = handleAuthError(error);
        if (errMsg) showToast(errMsg, "error");
    } finally {
        authActionInProgress = false;
        if (btn) {
            btn.disabled = false;
            btn.classList?.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

export async function handleEmailAuth(event) {
    if (event) {
        event.preventDefault?.();
        event.stopPropagation?.();
    }

    if (authActionInProgress) return;

    let form = event?.target?.closest?.('form') || event?.target;
    if (!form || form.tagName !== 'FORM') {
        form = document.getElementById('authForm') ||
               document.getElementById('emailAuthForm') ||
               document.getElementById('loginForm');
    }

    if (!form) {
        showToast("Authentication form not found.", "error");
        return;
    }

    const { emailInput, passwordInput } = getAuthInputs(form);
    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
        showToast("Please enter both email and password.", "error");
        return;
    }

    const submitBtn = event?.submitter ||
                      form.querySelector('button[type="submit"]') ||
                      document.getElementById('submitAuthBtn');

    authActionInProgress = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList?.add('opacity-50', 'cursor-not-allowed');
    }

    try {
        savePendingDraft();

        const remember = document.getElementById('rememberMe')?.checked ?? true;
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

        if (isSignUpMode) {
            // ===== CREATE ACCOUNT =====
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            await sendEmailVerification(user);
            await signOut(auth);

            showToast("🎉 Account created! Please check your email to verify before logging in.", "success");
            closeLoginModal();
        } else {
            // ===== SIGN IN =====
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            if (!user.emailVerified) {
                showToast("⚠️ Email unverified. Please check your inbox for the verification link.", "warning");
                await signOut(auth);
                return;
            }

            showToast("✅ Signed in successfully!", "success");
            closeLoginModal();
            restorePendingDraft();
        }
    } catch (error) {
        console.error("Email auth error:", error);
        const errMsg = handleAuthError(error);
        if (errMsg) showToast(errMsg, "error");
    } finally {
        authActionInProgress = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList?.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

// ====================== PASSWORD RESET ======================
export async function handlePasswordReset() {
    if (authActionInProgress) return;

    const resetEmailInput = document.getElementById('resetEmail');
    const email = resetEmailInput?.value?.trim();

    if (!email) {
        showToast("Please enter your email address.", "error");
        return;
    }

    authActionInProgress = true;
    const btn = document.getElementById('sendResetBtn');
    if (btn) {
        btn.disabled = true;
        btn.classList?.add('opacity-50', 'cursor-not-allowed');
    }

    try {
        await sendPasswordResetEmail(auth, email);
        showToast("✅ Password reset email sent! Check your inbox.", "success");
    } catch (error) {
        console.error("Password reset error:", error);
        const errMsg = handleAuthError(error);
        if (errMsg) showToast(errMsg, "error");
    } finally {
        authActionInProgress = false;
        if (btn) {
            btn.disabled = false;
            btn.classList?.remove('opacity-50', 'cursor-not-allowed');
        }
    }
}

export async function initAuthRedirectHandler() {
    try {
        const result = await getRedirectResult(auth);
        if (result?.user) {
            showToast("✅ Signed in successfully!", "success");
            closeLoginModal();
            restorePendingDraft();
        }
    } catch (error) {
        console.error("Redirect auth error:", error);
        const errMsg = handleAuthError(error);
        if (errMsg) showToast(errMsg, "error");
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
        if (btnElement.textContent === 'Show' || btnElement.textContent === 'Hide') {
            btnElement.textContent = isPassword ? 'Hide' : 'Show';
        }
        const eye = btnElement.querySelector('#eyeIcon');
        const eyeOff = btnElement.querySelector('#eyeOffIcon');
        if (eye && eyeOff) {
            eye.classList.toggle('hidden', isPassword);
            eyeOff.classList.toggle('hidden', !isPassword);
        }
    }
}

export function requireAuth(message = "Please sign in to proceed.") {
    if (!auth.currentUser) {
        savePendingDraft();
        showToast(message, "info");
        showAuthModal();
        return false;
    }
    return true;
}

export function updateUIForAuthState(userParam = null) {
    const activeUser = userParam || auth.currentUser;
    const isLoggedIn = !!activeUser && (activeUser.emailVerified || activeUser.providerData?.some(p => p.providerId === 'google.com'));

    const guestBtns = document.querySelectorAll('#guest-action-btn, #guest-action-btn-mobile, #guest-action-btn-drawer, .guest-only-btn');
    const profileBtn = document.getElementById('profile-btn');
    const signInElement = document.getElementById('signin-btn');
    const privateElements = document.querySelectorAll('.requires-auth');

    guestBtns.forEach(btn => btn.classList.toggle('hidden', isLoggedIn));
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

// ====================== MODAL CONTROLS ======================
export function showAuthModal() {
    const mainAuthModal = document.getElementById('authModal');
    if (mainAuthModal) {
        mainAuthModal.classList.remove('hidden');
        mainAuthModal.classList.add('flex');
        switchToAuthView();
        isSignUpMode = false;
        updateAuthModeUI();
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
    isSignUpMode = false;
}

export function closeCreateAccountModal() { closeLoginModal(); }
export function hideAuthModal() { closeLoginModal(); }

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

export function toggleProfileMenu(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const profileMenu = document.getElementById('profile-menu') || document.getElementById('user-dropdown');
    if (profileMenu) {
        profileMenu.classList.toggle('hidden');
    }
}

// ====================== EVENT BINDINGS ======================
export function bindHeaderEvents() {
    if (window.__authDelegationBound) return;
    window.__authDelegationBound = true;

    document.addEventListener('click', (e) => {
        // Auth Triggers
        if (e.target.closest('#googleAuthBtn, #googleSignInBtn, [data-action="google-login"], .google-auth-btn')) {
            e.preventDefault();
            googleLogin(e);
            return;
        }

        if (e.target.closest('#toggleAuthModeBtn, #switchAuthMode, [data-action="toggle-auth-mode"]')) {
            e.preventDefault();
            isSignUpMode = !isSignUpMode;
            updateAuthModeUI();
            return;
        }

        if (e.target.closest('#forgotPasswordBtn')) {
            e.preventDefault();
            switchToResetView();
            return;
        }

        if (e.target.closest('#backToAuthBtn')) {
            e.preventDefault();
            switchToAuthView();
            return;
        }

        if (e.target.closest('#sendResetBtn')) {
            e.preventDefault();
            handlePasswordReset();
            return;
        }

        if (e.target.closest('#logoutBtn, #logout-btn, [data-action="logout"], .logout-btn')) {
            e.preventDefault();
            logout();
            return;
        }

        if (e.target.closest('#guest-action-btn, #guest-action-btn-mobile, #guest-action-btn-drawer, #signin-btn-mobile, .auth-trigger-btn, [data-action="open-auth-modal"]')) {
            e.preventDefault();
            showAuthModal();
            return;
        }

        if (e.target.closest('[data-action="close-auth-modal"], #closeAuthModalBtn')) {
            e.preventDefault();
            closeLoginModal();
            return;
        }

        if (e.target.closest('#togglePasswordBtn, [data-action="toggle-password"]')) {
            e.preventDefault();
            const btn = e.target.closest('#togglePasswordBtn, [data-action="toggle-password"]');
            const targetId = btn.getAttribute('data-target') || 'loginPassword';
            togglePasswordVisibility(targetId, btn);
            return;
        }

        if (e.target.closest('#profile-btn, #profile-btn-mobile, [data-action="open-profile"]')) {
            e.preventDefault();
            if (typeof window.openProfile === 'function') window.openProfile();
            return;
        }

        if (e.target.closest('#request-verification-btn')) {
            e.preventDefault();
            openVerificationModal();
            return;
        }

        // Close dropdown menus when clicking outside
        if (!e.target.closest('#profile-btn, #profile-menu, #user-dropdown, .dropdown-container')) {
            document.querySelectorAll('#profile-menu, #user-dropdown, .dropdown-menu')
                .forEach(el => el.classList.add('hidden'));
        }
    });

    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (form?.matches?.('#authForm, #emailAuthForm, #loginForm, #signInForm, #signUpForm')) {
            e.preventDefault();
            handleEmailAuth(e);
        }
    });


    document.addEventListener('submit', (e) => {
        const form = e.target;
        if (form?.matches?.('#authForm, #emailAuthForm, #loginForm, #signInForm, #signUpForm')) {
            e.preventDefault();
            handleEmailAuth(e);
        }
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#profile-btn, #profile-menu, #user-dropdown, .dropdown-container')) {
            document.querySelectorAll('#profile-menu, #user-dropdown, .dropdown-menu')
                .forEach(el => el.classList.add('hidden'));
        }
    });

// ====================== AUTH INITIALIZATION ======================
export function initAuth() {
    bindHeaderEvents();

    return new Promise((resolve) => {
        getRedirectResult(auth)
            .then(async (result) => {
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
            const isPasswordUser = user?.providerData?.some(p => p.providerId === 'password');
            const isValidUser = user && (!isPasswordUser || user.emailVerified);

            if (isValidUser) {
                updateAppState({ isAuthenticated: true, currentUser: user });
                await createOrUpdateUser(user);
                refreshTierUI();
                if (typeof initNotifications === 'function') {
                    initNotifications(user.uid);
                }
                updateUIForAuthState(user);
            } else {
                updateAppState({ isAuthenticated: false, currentUser: null });
                updateVerificationUI(false);
                if (typeof initNotifications === 'function') {
                    initNotifications(null);
                }
                updateUIForAuthState(null);
            }

            window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: isValidUser ? user : null } }));
            resolve(isValidUser ? user : null);
        });
    });
}

// Export globals
window.showAuthModal = showAuthModal;
window.closeLoginModal = closeLoginModal;
window.logout = logout;
window.googleLogin = googleLogin;
window.openVerificationModal = openVerificationModal;
window.closeVerificationModal = closeVerificationModal;
window.toggleProfileMenu = toggleProfileMenu;
window.handleEmailAuth = handleEmailAuth;
window.handlePasswordReset = handlePasswordReset;
window.initAuth = initAuth;
