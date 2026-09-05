// js/auth.js - Authentication Engine & Identity Handlers
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

import { 
  auth, 
  googleProvider, 
  twitterProvider, 
  githubProvider, 
  db 
} from './firebase-config.js';

import { showToast } from './utils.js';
import { updateAppState } from './app-state.js';
import { applyTierTheme, updateTierBadge, clearProfileCache } from './tier.js';
import { initNotifications } from './notifications.js';

import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const DEFAULT_TIER = "citizen";
let authActionInProgress = false;
let authInitialized = false;

// ====================== HELPERS ======================

function refreshTierUI() {
  try {
    clearProfileCache?.();
    if (typeof window.refreshTierAndUI === 'function') {
      window.refreshTierAndUI();
    } else {
      applyTierTheme?.();
      updateTierBadge?.();
    }
  } catch (e) {
    console.warn("Tier UI refresh skipped:", e);
  }
}

/**
 * Creates or updates the users/{uid} document.
 * Must satisfy isSafeUserCreation() on first write.
 */
async function createOrUpdateUser(user) {
  if (!user?.uid) return;

  const userRef = doc(db, "users", user.uid);

  try {
    const snap = await getDoc(userRef);

    const safeEmail = (user.email || "").trim();
    const safeDisplayName = (user.displayName || (user.isAnonymous ? "Anonymous Citizen" : "Citizen Witness")).trim();
    // Rules prefer null over empty string for photoURL
    const safePhotoURL = user.photoURL && user.photoURL.trim() ? user.photoURL.trim() : null;

    if (!snap.exists()) {
      // ---------- Brand-new user ----------
      // Only fields allowed by isSafeUserCreation()
      const newUserData = {
        uid: user.uid,
        email: safeEmail,
        displayName: safeDisplayName,
        photoURL: safePhotoURL,
        isAnonymous: !!user.isAnonymous,
        tier: DEFAULT_TIER,          // "citizen" – allowed
        isVerified: false,           // must be false on create
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
        // NEVER include: isPhoneVerified, hasVerifiedPhone, phoneVerifiedAt,
        // role, isBanned, badges, admin, moderator, score, steward, etc.
      };

      try {
        await setDoc(userRef, newUserData);
        console.log("[auth] Created user document for", user.uid);
      } catch (createErr) {
        // Extremely rare fallback – try the absolute minimum
        console.warn("[auth] Full create failed, trying minimal payload:", createErr);
        await setDoc(userRef, {
          uid: user.uid,
          email: safeEmail,
          displayName: safeDisplayName,
          createdAt: serverTimestamp()
        });
        console.log("[auth] Created minimal user document for", user.uid);
      }

      updateVerificationUI(false);
      if (!user.isAnonymous) {
        showToast("🎉 Account created! Welcome to the Public Square.", "success");
      }
    } else {
      // ---------- Existing user ----------
      const existing = snap.data() || {};
      const changes = {
        lastLoginAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      if (safeDisplayName && safeDisplayName !== existing.displayName) {
        changes.displayName = safeDisplayName;
      }
      if (safePhotoURL !== existing.photoURL) {
        changes.photoURL = safePhotoURL;
      }
      if (safeEmail && safeEmail !== existing.email) {
        changes.email = safeEmail;
      }

      await updateDoc(userRef, changes);

      const isVerified = Boolean(
        existing.isVerified === true ||
        existing.isPhoneVerified === true ||
        existing.hasVerifiedPhone === true
      );
      updateVerificationUI(isVerified);
    }
  } catch (e) {
    console.error("[auth] User document error:", e);
    showToast(
      e?.code === "permission-denied"
        ? "Could not create/update profile (rules blocked it). Check console."
        : "Error updating profile state.",
      "error"
    );
  }
}

// Optional – make it available to other modules
export { createOrUpdateUser };
window.createOrUpdateUser = createOrUpdateUser;
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
    verifyBtn.textContent = isVerified ? "Verified" : "Get Verified";
    verifyBtn.disabled = isVerified;
    verifyBtn.classList.toggle("opacity-50", isVerified);
    verifyBtn.classList.toggle("cursor-not-allowed", isVerified);
  }
}

export function savePendingDraft() {
  const mainInput = document.getElementById('mainInput') ||
                    document.getElementById('squareSearchInput') ||
                    document.getElementById('testimonyInput');

  if (mainInput?.value.trim()) {
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
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null;
    case 'auth/popup-blocked':
      return "Popup was blocked by your browser. Switch to redirect mode or enable popups.";
    case 'auth/account-exists-with-different-credential':
      return "An account already exists with this email address using a different login provider.";
    default:
      return error?.message || "Authentication failed. Please try again.";
  }
}

// ====================== ANONYMOUS AUTH ======================

export async function loginAnonymously() {
  if (authActionInProgress) return;
  authActionInProgress = true;

  try {
    savePendingDraft();
    const result = await signInAnonymously(auth);
    if (result?.user) {
      showToast("🛡️ Signed in anonymously", "info");
      closeLoginModal();
      restorePendingDraft();
    }
  } catch (error) {
    console.error("Anonymous login error:", error);
    showToast("Anonymous authentication failed", "error");
  } finally {
    authActionInProgress = false;
  }
}

// ====================== SOCIAL LOGIN ======================

async function socialLogin(provider, providerName, event) {
  if (authActionInProgress) return;
  authActionInProgress = true;

  const btn = event?.target?.closest?.('button');
  if (btn) {
    btn.disabled = true;
    btn.classList.add('opacity-50', 'cursor-not-allowed');
  }

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ||
                   window.matchMedia('(display-mode: standalone)').matches;

  try {
    savePendingDraft();

    const remember = document.getElementById('rememberMe')?.checked ?? true;
    await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);

    if (isMobile) {
      await signInWithRedirect(auth, provider);
      return;
    }

    try {
      const result = await signInWithPopup(auth, provider);
      if (result?.user) {
        showToast(`✅ Signed in with ${providerName}!`, "success");
        closeLoginModal();
        restorePendingDraft();
      }
    } catch (popupError) {
      if (['auth/popup-blocked', 'auth/popup-closed-by-user'].includes(popupError.code)) {
        showToast("Popup blocked. Switching to redirect...", "info");
        await signInWithRedirect(auth, provider);
        return;
      }
      throw popupError;
    }
  } catch (error) {
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error.code)) {
      return;
    }
    console.error(`${providerName} login error:`, error);
    const msg = handleAuthError(error);
    if (msg) showToast(msg, "error");
  } finally {
    authActionInProgress = false;
    if (btn) {
      btn.disabled = false;
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
    }
  }
}

export async function googleLogin(event) {
  return socialLogin(googleProvider, "Google", event);
}

export async function twitterLogin(event) {
  return socialLogin(twitterProvider, "X (Twitter)", event);
}

export async function githubLogin(event) {
  return socialLogin(githubProvider, "GitHub", event);
}

// ====================== LOGOUT & UI ======================

export async function logout() {
  try {
    clearProfileCache?.();
    try {
      if (typeof initNotifications === 'function') {
        initNotifications(null);
      }
    } catch (_) {}

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
  const isLoggedIn = !!activeUser;

  // Guest / Sign-in buttons
  const guestSelectors = [
    '#guest-action-btn',
    '#guest-action-btn-mobile',
    '#guest-action-btn-drawer',
    '.guest-only-btn',
    '#signin-btn',
    '#signin-btn-mobile',
    '#openAuthModalBtn',
    '#openAuthModalBtnMobile'
  ].join(', ');

  document.querySelectorAll(guestSelectors)
    .forEach(el => el.classList.toggle('hidden', isLoggedIn));

  // Profile buttons
  const profileSelectors = [
    '#profile-btn',
    '#profile-btn-mobile',
    '.profile-action-btn',
    '#userProfileBtn',
    '#userProfileBtnMobile'
  ].join(', ');

  document.querySelectorAll(profileSelectors)
    .forEach(el => el.classList.toggle('hidden', !isLoggedIn));

  // Protected elements
  document.querySelectorAll('.requires-auth')
    .forEach(el => el.classList.toggle('hidden', !isLoggedIn));

  // Post action element opacity feedback
  document.querySelectorAll('#postButton, #btn-photo, #btn-voice')
    .forEach(btn => {
      if (btn) btn.style.opacity = isLoggedIn ? '1' : '0.6';
    });

  // Desktop user elements
  const userAvatarDesktop = document.getElementById('user-avatar-desktop');
  const defaultAvatarDesktop = document.getElementById('default-avatar-icon-desktop');
  const userNameDesktop = document.getElementById('user-name-desktop');

  // Mobile user elements
  const userAvatarMobile = document.getElementById('user-avatar-mobile');
  const defaultAvatarMobile = document.getElementById('default-avatar-icon-mobile');
  const userNameMobile = document.getElementById('user-name-mobile');

  if (isLoggedIn && activeUser) {
    // Desktop
    if (activeUser.photoURL && userAvatarDesktop) {
      userAvatarDesktop.src = activeUser.photoURL;
      userAvatarDesktop.classList.remove('hidden');
      defaultAvatarDesktop?.classList.add('hidden');
    } else {
      userAvatarDesktop?.classList.add('hidden');
      defaultAvatarDesktop?.classList.remove('hidden');
    }
    if (userNameDesktop && activeUser.displayName) {
      userNameDesktop.textContent = activeUser.displayName.split(' ')[0];
    }

    // Mobile
    if (activeUser.photoURL && userAvatarMobile) {
      userAvatarMobile.src = activeUser.photoURL;
      userAvatarMobile.classList.remove('hidden');
      defaultAvatarMobile?.classList.add('hidden');
    } else {
      userAvatarMobile?.classList.add('hidden');
      defaultAvatarMobile?.classList.remove('hidden');
    }
    if (userNameMobile && activeUser.displayName) {
      userNameMobile.textContent = activeUser.displayName.split(' ')[0];
    }
  } else {
    userAvatarDesktop?.classList.add('hidden');
    defaultAvatarDesktop?.classList.remove('hidden');
    if (userNameDesktop) userNameDesktop.textContent = '';

    userAvatarMobile?.classList.add('hidden');
    defaultAvatarMobile?.classList.remove('hidden');
    if (userNameMobile) userNameMobile.textContent = '';
  }

  if (typeof window.updateHeaderButtons === 'function') {
    window.updateHeaderButtons(isLoggedIn);
  }
}

export function showAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
  }
}

export function closeLoginModal() {
  document.querySelectorAll('#authModal, #loginModal, #createAccountModal')
    .forEach(modal => {
      if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.setAttribute('aria-hidden', 'true');
      }
    });
}

export function openVerificationModal() {
  if (!requireAuth("Please sign in to complete citizen verification.")) return;

  const phoneModal = document.getElementById('phoneVerificationModal');
  if (phoneModal) {
    phoneModal.classList.remove('hidden');
    phoneModal.classList.add('flex');
    phoneModal.setAttribute('aria-hidden', 'false');
    return;
  }

  const modal = document.getElementById('verificationModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

export function closeVerificationModal() {
  const phoneModal = document.getElementById('phoneVerificationModal');
  if (phoneModal) {
    phoneModal.classList.add('hidden');
    phoneModal.classList.remove('flex');
    phoneModal.setAttribute('aria-hidden', 'true');
  }

  const modal = document.getElementById('verificationModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

export function toggleProfileMenu(e) {
  e?.preventDefault();
  e?.stopPropagation();

  const menu = document.getElementById('profile-menu') || document.getElementById('user-dropdown');
  menu?.classList.toggle('hidden');
}

// ====================== EVENT BINDING ======================

export function bindHeaderEvents() {
  if (window.__authDelegationBound) return;
  window.__authDelegationBound = true;

  document.addEventListener('click', (e) => {
    // Google Auth
    if (e.target.closest('#googleAuthBtn, #googleSignInBtn, [data-action="google-login"], .google-auth-btn')) {
      e.preventDefault();
      googleLogin(e);
      return;
    }

    // Twitter / X Auth
    if (e.target.closest('#twitterAuthBtn, [data-action="twitter-login"], .twitter-auth-btn')) {
      e.preventDefault();
      twitterLogin(e);
      return;
    }

    // GitHub Auth
    if (e.target.closest('#githubAuthBtn, [data-action="github-login"], .github-auth-btn')) {
      e.preventDefault();
      githubLogin(e);
      return;
    }

    // Anonymous Auth Trigger
    if (e.target.closest('#anonAuthBtn, [data-action="anon-login"], .anon-auth-btn')) {
      e.preventDefault();
      loginAnonymously();
      return;
    }

    // Logout Trigger
    if (e.target.closest('#logoutBtn, #logout-btn, [data-action="logout"], .logout-btn')) {
      e.preventDefault();
      logout();
      return;
    }

    // Open Auth Modal
    if (e.target.closest('#openAuthModalBtn, #openAuthModalBtnMobile, #guest-action-btn, #guest-action-btn-mobile, #guest-action-btn-drawer, #signin-btn-mobile, .auth-trigger-btn, [data-action="open-auth-modal"]')) {
      e.preventDefault();
      showAuthModal();
      return;
    }

    // Close Auth Modal
    if (e.target.closest('[data-action="close-auth-modal"], #closeAuthModalBtn')) {
      e.preventDefault();
      closeLoginModal();
      return;
    }

    // Profile Trigger
    if (e.target.closest('#userProfileBtn, #userProfileBtnMobile, #profile-btn, #profile-btn-mobile, [data-action="open-profile"]')) {
      e.preventDefault();
      if (typeof window.openProfileModal === 'function') {
        window.openProfileModal();
      } else if (typeof window.openProfile === 'function') {
        window.openProfile();
      }
      return;
    }

    // Verification Trigger
    if (e.target.closest('#request-verification-btn')) {
      e.preventDefault();
      openVerificationModal();
      return;
    }

    // Close Dropdowns Outside Click
    if (!e.target.closest('#profile-btn, #profile-btn-mobile, #userProfileBtn, #profile-menu, #user-dropdown')) {
      document.querySelectorAll('#profile-menu, #user-dropdown')
        .forEach(el => el.classList.add('hidden'));
    }
  });
}

export function initAuth() {
  if (authInitialized) {
    return Promise.resolve(auth.currentUser);
  }
  authInitialized = true;

  bindHeaderEvents();

  return new Promise((resolve) => {
    // Handle redirect result for mobile devices
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
          console.error("Redirect auth error:", error);
          const msg = handleAuthError(error);
          if (msg) showToast(msg, "error");
        }
      });

    // Auth state observer
    onAuthStateChanged(auth, async (user) => {
      try {
        if (user) {
          updateAppState({ isAuthenticated: true, currentUser: user });
          await createOrUpdateUser(user);
          refreshTierUI();
          try {
            if (typeof initNotifications === 'function') {
              initNotifications(user.uid);
            }
          } catch (nErr) {
            console.warn("Notifications init failed:", nErr);
          }
          updateUIForAuthState(user);
        } else {
          updateAppState({ isAuthenticated: false, currentUser: null });
          updateVerificationUI(false);
          try {
            if (typeof initNotifications === 'function') {
              initNotifications(null);
            }
          } catch (_) {}
          updateUIForAuthState(null);
        }

        window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
      } catch (err) {
        console.error("Auth state handler error:", err);
      } finally {
        resolve(user || null);
      }
    });
  });
}

// Global exports
window.showAuthModal = showAuthModal;
window.closeLoginModal = closeLoginModal;
window.logout = logout;
window.googleLogin = googleLogin;
window.twitterLogin = twitterLogin;
window.githubLogin = githubLogin;
window.loginAnonymously = loginAnonymously;
window.openVerificationModal = openVerificationModal;
window.closeVerificationModal = closeVerificationModal;
window.toggleProfileMenu = toggleProfileMenu;
window.initAuth = initAuth;
window.requireAuth = requireAuth;
window.updateUIForAuthState = updateUIForAuthState;
