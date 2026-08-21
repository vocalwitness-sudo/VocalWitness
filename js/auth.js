// js/auth.js - Social Auth Only (Google + Twitter + GitHub)
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  onAuthStateChanged
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
import { applyTierTheme, updateTierBadge, clearProfileCache, TIERS } from './tier.js';
import { initNotifications } from './notifications.js';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let authActionInProgress = false;

// ====================== HELPERS ======================

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
  if (!user?.uid) return;

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
        tier: TIERS?.CITIZEN || "citizen",
        isVerified: false,
        isPhoneVerified: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      updateVerificationUI(false);
      showToast("🎉 Account created! Welcome to the Public Square.", "success");
    } else {
      const existing = snap.data() || {};
      const changes = {};

      if (safeDisplayName && safeDisplayName !== existing.displayName) {
        changes.displayName = safeDisplayName;
      }
      if (safePhotoURL && safePhotoURL !== existing.photoURL) {
        changes.photoURL = safePhotoURL;
      }
      if (safeEmail && safeEmail !== existing.email) {
        changes.email = safeEmail;
      }
      if (!existing.tier) changes.tier = TIERS?.CITIZEN || "citizen";
      if (existing.isPhoneVerified === undefined) changes.isPhoneVerified = false;

      if (Object.keys(changes).length > 0) {
        changes.updatedAt = serverTimestamp();
        await updateDoc(userRef, changes);
      }

      const isVerified = existing.isVerified || existing.isPhoneVerified || existing.hasVerifiedPhone || false;
      updateVerificationUI(isVerified);
    }
  } catch (e) {
    if (e?.code !== 'permission-denied') {
      console.error("User document error:", e);
      showToast("Error saving profile.", "error");
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
      return "Popup was blocked. Trying redirect method...";
    case 'auth/account-exists-with-different-credential':
      return "An account already exists with the same email using a different method.";
    default:
      return error?.message || "Authentication failed. Please try again.";
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
  document.querySelectorAll('#guest-action-btn, #guest-action-btn-mobile, #guest-action-btn-drawer, .guest-only-btn, #signin-btn, #signin-btn-mobile')
    .forEach(el => el.classList.toggle('hidden', isLoggedIn));

  // Profile buttons
  document.querySelectorAll('#profile-btn, #profile-btn-mobile, .profile-action-btn')
    .forEach(el => el.classList.toggle('hidden', !isLoggedIn));

  // Protected elements
  document.querySelectorAll('.requires-auth')
    .forEach(el => el.classList.toggle('hidden', !isLoggedIn));

  // Post buttons opacity
  document.querySelectorAll('#postButton, #btn-photo, #btn-voice')
    .forEach(btn => {
      if (btn) btn.style.opacity = isLoggedIn ? '1' : '0.6';
    });

  // Mobile avatar
  const userAvatarMobile = document.getElementById('user-avatar-mobile');
  const defaultAvatarMobile = document.getElementById('default-avatar-icon-mobile');
  const userNameMobile = document.getElementById('user-name-mobile');

  if (isLoggedIn && activeUser) {
    if (activeUser.photoURL && userAvatarMobile) {
      userAvatarMobile.src = activeUser.photoURL;
      userAvatarMobile.classList.remove('hidden');
      if (defaultAvatarMobile) defaultAvatarMobile.classList.add('hidden');
    } else {
      if (userAvatarMobile) userAvatarMobile.classList.add('hidden');
      if (defaultAvatarMobile) defaultAvatarMobile.classList.remove('hidden');
    }

    if (userNameMobile && activeUser.displayName) {
      userNameMobile.textContent = activeUser.displayName.split(' ')[0];
    }
  } else {
    if (userAvatarMobile) userAvatarMobile.classList.add('hidden');
    if (defaultAvatarMobile) defaultAvatarMobile.classList.remove('hidden');
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
  }
}

export function closeLoginModal() {
  document.querySelectorAll('#authModal, #loginModal, #createAccountModal')
    .forEach(modal => {
      modal?.classList.add('hidden');
      modal?.classList.remove('flex');
    });
}

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
    // Google
    if (e.target.closest('#googleAuthBtn, #googleSignInBtn, [data-action="google-login"], .google-auth-btn')) {
      e.preventDefault();
      googleLogin(e);
      return;
    }

    // Twitter / X
    if (e.target.closest('#twitterAuthBtn, [data-action="twitter-login"], .twitter-auth-btn')) {
      e.preventDefault();
      twitterLogin(e);
      return;
    }

    // GitHub
    if (e.target.closest('#githubAuthBtn, [data-action="github-login"], .github-auth-btn')) {
      e.preventDefault();
      githubLogin(e);
      return;
    }

    // Logout
    if (e.target.closest('#logoutBtn, #logout-btn, [data-action="logout"], .logout-btn')) {
      e.preventDefault();
      logout();
      return;
    }

    // Open Auth Modal
    if (e.target.closest('#guest-action-btn, #guest-action-btn-mobile, #guest-action-btn-drawer, #signin-btn-mobile, .auth-trigger-btn, [data-action="open-auth-modal"]')) {
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

    // Profile
    if (e.target.closest('#profile-btn, #profile-btn-mobile, [data-action="open-profile"]')) {
      e.preventDefault();
      if (typeof window.openProfile === 'function') window.openProfile();
      return;
    }

    // Verification
    if (e.target.closest('#request-verification-btn')) {
      e.preventDefault();
      openVerificationModal();
      return;
    }

    // Close dropdowns when clicking outside
    if (!e.target.closest('#profile-btn, #profile-btn-mobile, #profile-menu, #user-dropdown')) {
      document.querySelectorAll('#profile-menu, #user-dropdown')
        .forEach(el => el.classList.add('hidden'));
    }
  });
}

export function initAuth() {
  bindHeaderEvents();

  return new Promise((resolve) => {
    // Handle redirect result (mobile)
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
          console.error("Redirect error:", error);
          const msg = handleAuthError(error);
          if (msg) showToast(msg, "error");
        }
      });

    // Auth state listener
    onAuthStateChanged(auth, async (user) => {
      if (user) {
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

      window.dispatchEvent(new CustomEvent('auth-changed', { detail: { user } }));
      resolve(user || null);
    });
  });
}

// Make functions available globally
window.showAuthModal = showAuthModal;
window.closeLoginModal = closeLoginModal;
window.logout = logout;
window.googleLogin = googleLogin;
window.twitterLogin = twitterLogin;
window.githubLogin = githubLogin;
window.openVerificationModal = openVerificationModal;
window.closeVerificationModal = closeVerificationModal;
window.toggleProfileMenu = toggleProfileMenu;
window.initAuth = initAuth;
