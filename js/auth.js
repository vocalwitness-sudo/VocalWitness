/**
 * VocalWitness - Authentication & Identity Module (auth.js)
 * Handles Google OAuth, Anonymous node auth, user record creation,
 * identity state listeners, and profile/HUD UI synchronization.
 */

import { auth, db } from './firebase-config.js';
import { 
  GoogleAuthProvider, 
  signInWithPopup, 
  signInAnonymously, 
  signOut, 
  onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  doc, 
  getDoc, 
  setDoc, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Global current user reference
export let currentUser = null;

/**
 * Helper to display temporary toast notifications in UI
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  const bgClass = type === 'error' ? 'bg-red-900/90 border-red-500 text-red-200' 
                : type === 'success' ? 'bg-emerald-900/90 border-emerald-500 text-emerald-200' 
                : 'bg-zinc-900/90 border-zinc-700 text-zinc-200';

  toast.className = `fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-2xl border text-xs font-bold shadow-2xl backdrop-blur-md transition-all duration-300 ${bgClass}`;
  toast.innerText = message;
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Initializes or syncs user document in Firestore 'users' collection
 */
export async function syncUserProfile(user) {
  if (!user) return null;

  const userRef = doc(db, 'users', user.uid);
  try {
    const docSnap = await getDoc(userRef);

    if (!docSnap.exists()) {
      // Setup initial data structure for new Node identity
      const newUserData = {
        uid: user.uid,
        displayName: user.displayName || `Witness-${user.uid.slice(0, 6)}`,
        email: user.email || null,
        photoURL: user.photoURL || null,
        isAnonymous: user.isAnonymous || false,
        humanityScore: user.isAnonymous ? 30 : 50,
        tierLevel: 1,
        tierName: 'Level 1 Witness',
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
        bio: 'Verified Human Reporter on VocalWitness Ledger',
        settings: {
          notifications: true,
          publicVisibility: true
        }
      };

      await setDoc(userRef, newUserData);
      return newUserData;
    } else {
      // Existing user: retrieve data
      return docSnap.data();
    }
  } catch (error) {
    console.error("Error syncing user document:", error);
    return null;
  }
}

/**
 * Authenticate via Google OAuth Popup
 */
export async function googleLogin() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    const user = result.user;
    await syncUserProfile(user);
    showToast("Node Link Established: Google OAuth", "success");
    return user;
  } catch (error) {
    console.error("Google Auth Error:", error);
    showToast(`Auth Failed: ${error.message}`, "error");
    throw error;
  }
}

/**
 * Authenticate as an Anonymous Reporter Node
 */
export async function anonymousLogin() {
  try {
    const result = await signInAnonymously(auth);
    const user = result.user;
    await syncUserProfile(user);
    showToast("Anonymous Identity Node Initialized", "info");
    return user;
  } catch (error) {
    console.error("Anonymous Auth Error:", error);
    showToast("Failed to initialize anonymous node.", "error");
    throw error;
  }
}

/**
 * Sign out and reset interface state
 */
export async function logout() {
  try {
    await signOut(auth);
    currentUser = null;
    showToast("Identity Node Disconnected", "info");
    
    // Toggle UI views back to auth screen
    const authSection = document.getElementById('authSection');
    const mainApp = document.getElementById('mainApp');
    if (authSection) authSection.classList.remove('hidden');
    if (mainApp) mainApp.classList.add('hidden');
  } catch (error) {
    console.error("Sign-out error:", error);
    showToast("Failed to disconnect node.", "error");
  }
}

/**
 * Update HUD and Header User Interface details
 */
export function updateAuthUI(user, userData = null) {
  const authSection = document.getElementById('authSection');
  const mainApp = document.getElementById('mainApp');
  
  if (user) {
    if (authSection) authSection.classList.add('hidden');
    if (mainApp) mainApp.classList.remove('hidden');

    const name = userData?.displayName || user.displayName || `Node-${user.uid.slice(0, 5)}`;
    const avatarChar = name.charAt(0).toUpperCase();

    // Update Header HUD Elements
    const userNameEl = document.getElementById('userName');
    const userAvatarEl = document.getElementById('userAvatar');
    const humanityScoreEl = document.getElementById('humanityScore');

    if (userNameEl) userNameEl.innerText = name;
    if (userAvatarEl) userAvatarEl.innerText = avatarChar;
    if (humanityScoreEl) humanityScoreEl.innerText = userData?.humanityScore ?? 50;

    // Update Standalone Profile Tab Elements if present
    const profileNameEl = document.getElementById('profileName');
    const profileBigAvatarEl = document.getElementById('profileBigAvatar');
    const profileTierTextEl = document.getElementById('profileTierText');

    if (profileNameEl) profileNameEl.innerText = name;
    if (profileBigAvatarEl) profileBigAvatarEl.innerText = avatarChar;
    if (profileTierTextEl) profileTierTextEl.innerText = userData?.tierName || 'Level 1 Witness';

  } else {
    if (authSection) authSection.classList.remove('hidden');
    if (mainApp) mainApp.classList.add('hidden');
  }
}

/**
 * Main Auth Initialization Listener
 * Callback receives (user, userData) upon state resolution
 */
export function initAuth(onUserResolved) {
  onAuthStateChanged(auth, async (user) => {
    currentUser = user;
    if (user) {
      const userData = await syncUserProfile(user);
      updateAuthUI(user, userData);
      if (typeof onUserResolved === 'function') {
        onUserResolved(user, userData);
      }
    } else {
      updateAuthUI(null);
      if (typeof onUserResolved === 'function') {
        onUserResolved(null, null);
      }
    }
  });
}

/**
 * Guard function to enforce authentication before sensitive actions
 */
export function requireAuth(message = "Please sign in to continue") {
  if (!auth.currentUser) {
    showToast(message, "error");
    if (typeof window.showAuthModal === 'function') {
      window.showAuthModal();
    } else {
      const authSection = document.getElementById('authSection');
      if (authSection) authSection.classList.remove('hidden');
    }
    return false;
  }
  return true;
}

// Bind requireAuth globally as well
window.requireAuth = requireAuth;

// Bind methods globally to window for inline onclick handlers in HTML
window.googleLogin = googleLogin;
window.anonymousLogin = anonymousLogin;
window.logout = logout;
