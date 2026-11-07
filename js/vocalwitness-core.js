/**
 * js/vocalwitness-core.js
 * -------------------------------------------------------------
 * LEGACY / SAFE SHIM ONLY
 *
 * All sealed testimony creation MUST go through:
 *   import { submitTestimony } from './createPost.js';
 *
 * This file no longer performs any client-side writes to the
 * testimonies collection and no longer uploads evidence via
 * the old Firebase Storage path.
 *
 * Kept only for backward-compatible imports of initAuthObserver
 * and a couple of pure helpers. Do not add new sealed-write logic here.
 * -------------------------------------------------------------
 */

import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// Prefer the shared firebase-config instance when available
let auth, db;
try {
  const config = await import('./firebase-config.js');
  auth = config.auth;
  db   = config.db;
} catch (_) {
  auth = getAuth();
  db   = getFirestore();
}

/* ============================================================
   1. AUTH STATE OBSERVER & PROFILE UI TOGGLES
   (kept for any remaining callers – prefer auth.js in new code)
   ============================================================ */
export function initAuthObserver() {
  onAuthStateChanged(auth, async (user) => {
    const guestBtns = [
      document.getElementById('guest-action-btn'),
      document.getElementById('guest-action-btn-mobile')
    ];
    const profileBtns = [
      document.getElementById('profile-btn'),
      document.getElementById('profile-btn-mobile')
    ];

    if (user) {
      guestBtns.forEach(btn => btn && btn.classList.add('hidden'));
      profileBtns.forEach(btn => {
        if (btn) {
          btn.classList.remove('hidden');
          btn.classList.add('flex');
        }
      });

      try {
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);

        let displayName = user.displayName || "My Profile";
        let avatarUrl   = user.photoURL;

        if (userSnap.exists()) {
          const data = userSnap.data();
          if (data.displayName) displayName = data.displayName;
          if (data.avatarUrl || data.photoURL) {
            avatarUrl = data.avatarUrl || data.photoURL;
          }
        }

        ['desktop', 'mobile'].forEach(suffix => {
          const isMobile   = suffix === 'mobile';
          const nameEl     = document.getElementById(isMobile ? 'user-name-mobile' : 'user-name-desktop');
          const avatarImg  = document.getElementById(isMobile ? 'user-avatar-mobile' : 'user-avatar-desktop');
          const defaultIcon = document.getElementById(isMobile ? 'default-avatar-icon-mobile' : 'default-avatar-icon-desktop');

          if (nameEl) nameEl.textContent = displayName;
          if (avatarUrl && avatarImg) {
            avatarImg.src = avatarUrl;
            avatarImg.classList.remove('hidden');
            if (defaultIcon) defaultIcon.classList.add('hidden');
          }
        });
      } catch (error) {
        console.error("[vocalwitness-core] Error fetching user profile:", error);
      }
    } else {
      guestBtns.forEach(btn => {
        if (btn) {
          btn.classList.remove('hidden');
          btn.classList.add('flex');
        }
      });
      profileBtns.forEach(btn => btn && btn.classList.add('hidden'));
    }
  });
}

/* ============================================================
   2. PURE HELPERS (safe to keep)
   ============================================================ */

/**
 * SHA-256 of a File / Blob / ArrayBuffer / string
 * Prefer the shared helper in utils.js or createPost.js in new code.
 */
export async function generateSHA256Hash(data) {
  let buffer;
  if (data instanceof ArrayBuffer) {
    buffer = data;
  } else if (data instanceof Blob || data instanceof File) {
    buffer = await data.arrayBuffer();
  } else if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data);
  } else {
    throw new Error("Invalid data for SHA-256 hashing");
  }
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ============================================================
   3. DISABLED – OLD INSECURE PATHS
   ============================================================ */

/**
 * @deprecated PERMANENTLY DISABLED
 * Old client-side EXIF scrub + Firebase Storage upload.
 * Do not use. Use media-pipeline.js + upload.js instead.
 */
export async function scrubAndUploadImage(/* file, userId */) {
  console.error(
    '[VocalWitness] scrubAndUploadImage() is permanently disabled. ' +
    'Use processAndUploadMedia() from media-pipeline.js'
  );
  throw new Error(
    'Legacy scrubAndUploadImage is disabled. Use the secure media pipeline.'
  );
}

/**
 * @deprecated PERMANENTLY DISABLED
 * Old direct Firestore write path.
 * ALL sealed testimonies MUST go through:
 *   import { submitTestimony } from './createPost.js';
 */
export async function publishTestimony(/* submissionData, mediaFile */) {
  console.error(
    '[VocalWitness] publishTestimony() in vocalwitness-core.js is permanently disabled. ' +
    'Use submitTestimony() from createPost.js (Cloud Function path).'
  );
  throw new Error(
    'Legacy publishTestimony is disabled. Use the secure Cloud Function path (createPost.js → submitTestimonySecure).'
  );
}

/* ============================================================
   4. Convenience re-export (optional)
   New code should import directly from createPost.js
   ============================================================ */
export async function submitTestimonySecureWrapper(params) {
  const { submitTestimony } = await import('./createPost.js');
  return submitTestimony(params);
}
