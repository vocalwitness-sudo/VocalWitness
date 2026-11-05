/**
 * Public profile cache for VocalWitness UI.
 * Reads publicProfiles/{uid} (readable by anyone per rules).
 * Falls back to truncated uid if missing.
 */
import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

const cache = new Map(); // uid -> { displayName, photoURL, username, tierBadge }
const inflight = new Map();

function fallbackProfile(uid) {
  const short = (uid || '????').substring(0, 8);
  return {
    uid,
    displayName: short + '…',
    photoURL: null,
    username: null,
    tierBadge: null,
    isFallback: true,
  };
}

/**
 * @param {string} uid
 * @returns {Promise<{uid, displayName, photoURL, username, tierBadge, isFallback?}>}
 */
export async function getPublicProfile(uid) {
  if (!uid) return fallbackProfile('unknown');
  if (cache.has(uid)) return cache.get(uid);

  if (inflight.has(uid)) return inflight.get(uid);

  const p = (async () => {
    try {
      const snap = await getDoc(doc(db, 'publicProfiles', uid));
      if (snap.exists()) {
        const d = snap.data() || {};
        const profile = {
          uid,
          displayName: d.displayName || d.username || `${uid.substring(0, 8)}…`,
          photoURL: d.photoURL || null,
          username: d.username || null,
          tierBadge: d.tierBadge || null,
          isFallback: false,
        };
        cache.set(uid, profile);
        return profile;
      }
    } catch (e) {
      console.warn('[profile-cache] fetch failed', uid, e?.message || e);
    }
    const fb = fallbackProfile(uid);
    cache.set(uid, fb);
    return fb;
  })();

  inflight.set(uid, p);
  try {
    return await p;
  } finally {
    inflight.delete(uid);
  }
}

/** Batch fetch (parallel, cached) */
export async function getPublicProfiles(uids = []) {
  const unique = [...new Set(uids.filter(Boolean))];
  const list = await Promise.all(unique.map((id) => getPublicProfile(id)));
  const map = {};
  list.forEach((p) => {
    map[p.uid] = p;
  });
  return map;
}

/**
 * Small avatar + name HTML (escaped by caller for name if needed).
 * Uses textContent-safe pattern via escapeHtml param.
 */
export function profileChipHtml(profile, escapeHtml) {
  const name = escapeHtml(profile.displayName || 'Citizen');
  const initial = escapeHtml((profile.displayName || '?').charAt(0).toUpperCase());
  const photo = profile.photoURL
    ? `<img src="${escapeHtml(profile.photoURL)}" alt="" class="h-full w-full object-cover" loading="lazy" referrerpolicy="no-referrer">`
    : initial;

  return {
    name,
    avatarInner: photo,
    username: profile.username ? escapeHtml('@' + profile.username) : '',
  };
}

export function clearProfileCache() {
  cache.clear();
}
