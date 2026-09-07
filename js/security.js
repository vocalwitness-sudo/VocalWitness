/**
 * VocalWitness Security — Batch 4 (Updated)
 * Panic / clear-from-device, storage key registry, optional AES-GCM key lock.
 * Important: This only clears the local device. The public ledger remains immutable.
 */

import { auth } from './firebase-config.js';
import { showToast } from './utils.js';

/** All local keys that must be destroyed on panic */
export const PANIC_STORAGE_KEYS = [
  'vw_ephemeral_identity',
  'vw_anonymous_session_id',
  'vw_current_session',
  'hasSeenLegal',
  'onboardingComplete',
  'vw_offline_queue',
  'vw_pending_posts',
  'vw_data_saver',
  'vw_draft',
  'vw_default_door',
  'vw_default_page',
  'theme',
];

const DEFAULT_PANIC_REDIRECT = 'https://www.accuweather.com'; // harmless decoy page

/**
 * Encrypt a private/ephemeral key with AES-GCM
 */
export async function encryptKey(privateKey, masterLock) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(privateKey);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterLock,
    encoded
  );

  return { iv, encrypted };
}

/**
 * Decrypt with AES-GCM
 */
export async function decryptKey(encryptedData, iv, masterLock) {
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    masterLock,
    encryptedData
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Derive AES-GCM key from passphrase (PBKDF2)
 */
export async function deriveMasterLock(passphrase, saltBytes) {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 120000, // slightly higher
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Clear all known local identity & session data
 */
export function clearLocalIdentityStores() {
  try {
    // Clear specific keys
    for (const key of PANIC_STORAGE_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }

    // Clear any remaining vw_ or firebase keys
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('vw_') || k.startsWith('firebase:') || k.includes('firebase'))) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => localStorage.removeItem(k));

    sessionStorage.clear();
  } catch (e) {
    console.warn('[security] Partial storage clear failure', e);
  }
}

/**
 * Delete all IndexedDB databases (best effort)
 */
export async function clearAllIndexedDB() {
  try {
    if (indexedDB.databases) {
      const dbs = await indexedDB.databases();
      await Promise.all(
        (dbs || []).map(db => {
          return new Promise(resolve => {
            if (!db?.name) return resolve();
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = req.onerror = req.onblocked = () => resolve();
          });
        })
      );
    } else {
      // Fallback for older browsers
      const known = ['VocalWitnessDB', 'vw-offline', 'vw-db', 'firebaseLocalStorageDb', 'firebase-heartbeat-database'];
      await Promise.all(known.map(name => {
        return new Promise(resolve => {
          const req = indexedDB.deleteDatabase(name);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        });
      }));
    }
  } catch (e) {
    console.warn('[security] IndexedDB clear failed', e);
  }
}

/**
 * Ask Service Worker to clear caches
 */
export function requestServiceWorkerCachePurge() {
  try {
    if (navigator.serviceWorker?.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'VW_PANIC_CLEAR_CACHES'
      });
    }
  } catch (e) {
    console.warn('[security] SW cache purge failed', e);
  }
}

/**
 * FULL DEVICE PANIC
 * Clears everything local. Does NOT touch the server ledger.
 */
export async function panicClearDevice(opts = {}) {
  const redirectUrl = opts.redirectUrl || DEFAULT_PANIC_REDIRECT;

  try {
    // 1. Sign out from Firebase
    if (auth?.currentUser) {
      await auth.signOut().catch(() => {});
    }
  } catch (_) {}

  // 2. Clear all local data
  clearLocalIdentityStores();
  await clearAllIndexedDB();
  requestServiceWorkerCachePurge();

  // Small delay so SW message can process
  await new Promise(r => setTimeout(r, 100));

  // 3. Redirect to safe decoy page
  if (!opts.skipRedirect) {
    window.location.replace(redirectUrl);
  }
}

/**
 * SHA-256 helper
 */
export async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input));
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Create public nullifier (unlinkable)
 */
export async function makePublicNullifier(secretOrUid, postSalt) {
  return sha256Hex(`${secretOrUid}|${postSalt}|vw-nullifier-v1`);
}

// ====================== GLOBAL EXPORTS ======================
if (typeof window !== 'undefined') {
  window.panicClearDevice = panicClearDevice;
  window.VW_PANIC_STORAGE_KEYS = PANIC_STORAGE_KEYS;
}
