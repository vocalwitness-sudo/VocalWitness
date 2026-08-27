/**
 * VocalWitness Security — Batch 4
 * Panic / clear-from-device, storage key registry, optional AES-GCM key lock.
 * Ledger on the server stays immutable; this only clears the local device.
 */

import { auth } from './firebase-config.js';

/** All local keys that must die on panic (onboarding, session, prefs that can leak context). */
export const PANIC_STORAGE_KEYS = [
  'vw_ephemeral_identity',
  'vw_anonymous_session_id',
  'hasSeenLegal',
  'onboardingComplete',
  'vw_offline_queue',
  'vw_pending_posts',
  'vw_data_saver',
  'vw_draft',
];

const DEFAULT_PANIC_REDIRECT = 'https://www.accuweather.com';

/**
 * Encrypt a private/ephemeral key with a CryptoKey (AES-GCM).
 */
export async function encryptKey(privateKey, masterLock) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encodedKey = new TextEncoder().encode(privateKey);

  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterLock,
    encodedKey
  );

  return { iv, encrypted };
}

/**
 * Decrypt with AES-GCM.
 */
export async function decryptKey(encryptedData, iv, masterLock) {
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    masterLock,
    encryptedData
  );
  return new TextDecoder().decode(decrypted);
}

/**
 * Derive an AES-GCM key from a passphrase (for optional "Save Key" lock).
 */
export async function deriveMasterLock(passphrase, saltBytes) {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    enc.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Wipe known local keys + full storage surfaces.
 */
export function clearLocalIdentityStores() {
  try {
    for (const key of PANIC_STORAGE_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
    // Belt-and-suspenders for any leftover vw_* keys
    const lsKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && (k.startsWith('vw_') || k.startsWith('firebase:'))) lsKeys.push(k);
    }
    lsKeys.forEach((k) => localStorage.removeItem(k));

    sessionStorage.clear();
  } catch (e) {
    console.warn('[security] storage clear partial failure', e);
  }
}

/**
 * Delete all IndexedDB databases we can enumerate (offline queue lives here).
 */
export async function clearAllIndexedDB() {
  try {
    if (!indexedDB.databases) {
      // Fallback: best-effort known names
      const known = ['VocalWitnessDB', 'vw-offline', 'vw-db', 'firebaseLocalStorageDb'];
      await Promise.all(
        known.map(
          (name) =>
            new Promise((resolve) => {
              const req = indexedDB.deleteDatabase(name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            })
        )
      );
      return;
    }

    const dbs = await indexedDB.databases();
    await Promise.all(
      (dbs || []).map(
        (db) =>
          new Promise((resolve) => {
            if (!db?.name) return resolve();
            const req = indexedDB.deleteDatabase(db.name);
            req.onsuccess = () => resolve();
            req.onerror = () => resolve();
            req.onblocked = () => resolve();
          })
      )
    );
  } catch (e) {
    console.warn('[security] IndexedDB clear failed', e);
  }
}

/**
 * Ask the service worker to wipe Cache Storage.
 */
export function requestServiceWorkerCachePurge() {
  try {
    if (!navigator.serviceWorker?.controller) return;
    navigator.serviceWorker.controller.postMessage({
      type: 'VW_PANIC_CLEAR_CACHES',
    });
  } catch (e) {
    console.warn('[security] SW message failed', e);
  }
}

/**
 * Full device panic: local only. Public ledger is never touched.
 * @param {{ redirectUrl?: string, skipRedirect?: boolean }} opts
 */
export async function panicClearDevice(opts = {}) {
  const redirectUrl = opts.redirectUrl || DEFAULT_PANIC_REDIRECT;

  try {
    if (auth?.currentUser) {
      await auth.signOut().catch(() => {});
    }
  } catch (_) {}

  clearLocalIdentityStores();
  await clearAllIndexedDB();
  requestServiceWorkerCachePurge();

  // Brief moment for SW message to land
  await new Promise((r) => setTimeout(r, 80));

  if (!opts.skipRedirect && typeof window !== 'undefined') {
    window.location.replace(redirectUrl);
  }
}

/**
 * SHA-256 hex helper (nullifiers / public unlinkable ids).
 */
export async function sha256Hex(input) {
  const data = new TextEncoder().encode(String(input));
  const hash = await window.crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Per-post public nullifier — does not reuse stable session id on the public record.
 */
export async function makePublicNullifier(secretOrUid, postSalt) {
  return sha256Hex(`${secretOrUid}|${postSalt}|vw-nullifier-v1`);
}

// Global for safety.html / inline panic buttons
if (typeof window !== 'undefined') {
  window.panicClearDevice = panicClearDevice;
  window.VW_PANIC_STORAGE_KEYS = PANIC_STORAGE_KEYS;
}
