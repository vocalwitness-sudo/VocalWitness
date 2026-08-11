// js/auth.js - Auth Handler with Profile Cache Sync & Verified State Guards
import {
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendEmailVerification,
    onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import { auth, provider, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { updateAppState } from './app-state.js';
import { applyTierTheme, updateTierBadge, clearProfileCache } from './tier.js';
import { initNotifications } from './notifications.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

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
                updatedAt: serverTimestamp()
            });
            updateVerificationUI(false);
        } else {
            const existingData = snap.data() || {};
            const updatePayload = {
                updatedAt: serverTimestamp()
            };

            if (safeDisplayName && safeDisplayName !== existingData.displayName) {
                updatePayload.displayName = safeDisplayName;
            }
            if (safePhotoURL && safePhotoURL !== existingData.photoURL) {
                updatePayload.photoURL = safePhotoURL;
            }
            if (safeEmail && safeEmail !== existingData.email) {
                updatePayload.email = safeEmail;
            }

            await updateDoc(userRef, updatePayload);
            updateVerificationUI(existingData.isVerified || false);
        }
    } catch (e) {
        console.error("User document update error:", e);
    }
}

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
    const mainInput = document.getElementById('mainInput') || document.getElementById('squareSearchInput') || document.getElementById('testimonyInput');
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
        const mainInput = document.getElementById('mainInput') || document.getElementById('squareSearchInput') || document.getElementById('testimonyInput');
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

// ====================== AUTH ACTIONS ======================
export async function googleLogin(event) {
    if (event) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }

    if (authActionInProgress) return;
    authActionInProgress = true;

    const rawTarget = event?.target || event?.currentTarget;
    const btn = (rawTarget && typeof rawTarget.closest === 'function') 
                ? rawTarget.closest('button') 
                : (document.getElementById('googleAuthBtn') || document.getElementById('googleSignInBtn'));

    if (btn && typeof btn.setAttribute === 'function') {
        try {
            btn.setAttribute('type', 'button');
        } catch (e) {}
        
        btn.disabled = true;
        if (btn.classList && typeof btn.classList.add === 'function') {
            btn.classList.add('opacity-50', 'cursor-not-allowed');
        }
    }

    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.matchMedia('(display-mode: standalone)').matches;

    try {
        try { savePendingDraft(); } catch (e) {}

        if (provider && typeof provider.setCustomParameters === 'function') {
            provider.setCustomParameters({ prompt: 'select_account' });
        }

        if (isMobile) {
            await signInWithRedirect(auth, provider);
            return;
        }

        const userCredential = await signInWithPopup(auth, provider);
        if (userCredential?.user) {
            await createOrUpdateUser(userCredential.user);
            showToast("✅ Signed in successfully!", "success");
            closeLoginModal();
            restorePendingDraft();
        }
    } catch (error) {
        if (error.code === 'auth/popup-closed-by-user' || error.code === 'auth/cancelled-popup-request') {
            console.warn("Google sign-in popup closed by user.");
            return;
        }
        if (error.code === 'auth/popup-blocked') {
            showToast("⚠️ Sign-in popup was blocked by browser. Switching to redirect...", "warning");
            await signInWithRedirect(auth, provider);
            return;
        }
        console.error("Google login error:", error);
        const errMsg = handleAuthError(error);
        if (errMsg) showToast(errMsg, "error");
    } finally {
        authActionInProgress = false;
        if (btn && typeof btn.removeAttribute === 'function') {
            btn.disabled = false;
            if (btn.classList && typeof btn.classList.remove === 'function') {
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        }
    }
} 

export async function handleEmailAuth(event) {
    if (event) {
        if (typeof event.preventDefault === 'function') event.preventDefault();
        if (typeof event.stopPropagation === 'function') event.stopPropagation();
    }

    if (authActionInProgress) return;

    // Correctly resolve form target across click and submit events
    let form = null;
    if (event?.target) {
        form = event.target.tagName === 'FORM' ? event.target : event.target.closest('form');
    }
    if (!form) {
        form = document.getElementById('emailAuthForm') || document.getElementById('loginForm');
    }

    // Safely exit if no form exists in the DOM yet
    if (!form) return;

    const submitBtn = event?.submitter || document.getElementById('signInBtn') || form.querySelector('button[type="submit"]');

    const emailInput = form.querySelector('input[type="email"]') || document.getElementById('authEmail');
    const passwordInput = form.querySelector('input[type="password"]') || document.getElementById('authPassword');

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
        showToast("Please enter both email and password.", "error");
        return;
    }

    authActionInProgress = true;
    if (submitBtn && submitBtn.classList) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    try {
        try { savePendingDraft(); } catch (e) {}

        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        if (!user.emailVerified) {
            showToast("⚠️ Email unverified. Please check your inbox for the verification link.", "warning");
            await signOut(auth);
            return;
        }

        showToast("✅ Signed in successfully!", "success");
        closeLoginModal();
        try { restorePendingDraft(); } catch (e) {}
    } catch (error) {
        console.error("Email sign-in error:", error);
        const errMsg = handleAuthError(error);
        if (errMsg) showToast(errMsg, "error");
    } finally {
        authActionInProgress = false;
        if (submitBtn && submitBtn.classList) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
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
export async function handleEmailSignUp(event) {
    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    if (authActionInProgress) return;

    const form = event?.target?.closest('form') || event?.target;
    const submitBtn = event?.submitter || document.getElementById('signUpSubmitBtn') || document.getElementById('createAccountBtn') || form?.querySelector('button[type="submit"]');

    const emailInput = form?.querySelector('input[type="email"]') || document.getElementById('signUpEmail') || document.getElementById('authEmail');
    const passwordInput = form?.querySelector('input[type="password"]') || document.getElementById('signUpPassword') || document.getElementById('authPassword');

    const email = emailInput?.value?.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
        showToast("Please enter both email and password to create an account.", "error");
        return;
    }

    if (password.length < 6) {
        showToast("Password must be at least 6 characters long.", "error");
        return;
    }

    authActionInProgress = true;
    if (submitBtn && submitBtn.classList) {
        submitBtn.disabled = true;
        submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
    }

    try {
        savePendingDraft();

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await createOrUpdateUser(user);
        await sendEmailVerification(user);
        await signOut(auth);

        showToast("🎉 Account created! Check your email inbox to verify your account before logging in.", "success");
        closeLoginModal();

        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';

    } catch (error) {
        console.error("Email sign-up error:", error);
        const errMsg = handleAuthError(error);
        if (errMsg) showToast(errMsg, "error");
    } finally {
        authActionInProgress = false;
        if (submitBtn && submitBtn.classList) {
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

// ====================== MODAL CONTROLS ======================
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
    if (!window.__authDelegationBound) {
        document.addEventListener('click', (e) => {

            const googleBtn = e.target.closest('#googleAuthBtn, #googleSignInBtn, [data-action="google-login"], .google-auth-btn');
            if (googleBtn) {
                e.preventDefault();
                e.stopPropagation();
                googleLogin(e);
                return;
            }

            const signUpBtn = e.target.closest('#signUpBtn, #createAccountBtn, [data-action="sign-up"], .create-account-btn');
            if (signUpBtn) {
                e.preventDefault();
                e.stopPropagation();
                handleEmailSignUp(e);
                return;
            }

            const signInBtn = e.target.closest('#signInBtn, #signInSubmitBtn, [data-action="sign-in"], .sign-in-btn');
            if (signInBtn && !e.target.closest('form')) {
                e.preventDefault();
                e.stopPropagation();
                handleEmailAuth(e);
                return;
            }

            const logoutBtn = e.target.closest('#logoutBtn, #logout-btn, [data-action="logout"], .logout-btn');
            if (logoutBtn) {
                e.preventDefault();
                logout();
                return;
            }

            const guestBtn = e.target.closest('#guest-action-btn, #signin-btn-mobile, [data-action="open-auth-modal"]');
            if (guestBtn) {
                e.preventDefault();
                showAuthModal();
                return;
            }

            const profileBtn = e.target.closest('#profile-btn, #profile-btn-mobile, #mobile-profile-nav-btn, [data-action="open-profile"], [data-action="toggle-profile-menu"]');
            if (profileBtn) {
                e.preventDefault();
                if (typeof window.openProfile === 'function') {
                    window.openProfile();
                } else {
                    const modal = document.getElementById('profileModal');
                    if (modal) modal.classList.remove('hidden');
                }
                return;
            }

            const closeBtn = e.target.closest('[data-action="close-auth-modal"], .close-modal-btn');
            if (closeBtn) {
                e.preventDefault();
                closeLoginModal();
                return;
            }

            const verifyTriggerBtn = e.target.closest('#request-verification-btn');
            if (verifyTriggerBtn) {
                e.preventDefault();
                openVerificationModal();
                return;
            }

            const toggleBtn = e.target.closest('[data-action="toggle-password"]');
            if (toggleBtn) {
                e.preventDefault();
                const targetId = toggleBtn.getAttribute('data-target');
                if (targetId) togglePasswordVisibility(targetId, toggleBtn);
            }
        });

        document.addEventListener('submit', (e) => {
            const form = e.target;

            if (form && typeof form.matches === 'function') {
                if (form.matches('#emailAuthForm, #signInForm, #loginForm') || form.querySelector('#signInBtn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof handleEmailAuth === 'function') {
                        handleEmailAuth(e);
                    }
                } else if (form.matches('#signUpForm, #createAccountForm') || form.querySelector('#signUpBtn')) {
                    e.preventDefault();
                    e.stopPropagation();
                    if (typeof handleEmailSignUp === 'function') {
                        handleEmailSignUp(e);
                    }
                }
            }
        });

        window.__authDelegationBound = true;
    }

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
}

// ====================== AUTH INITIALIZATION ======================
export function initAuth() {
    bindHeaderEvents();
    
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
window.handleEmailAuth = handleEmailAuth;
window.handleEmailSignUp = handleEmailSignUp;

// Self-initialize listeners
initAuth();
