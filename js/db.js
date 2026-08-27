// js/db.js - Database Operations & Offline Storage Engine (Batch 4)
import { db, auth } from './firebase-config.js';
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  serverTimestamp,
  increment,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

import { showToast } from './utils.js';
import { getCurrentUserTier, getCurrentWitnessLevel } from './tier.js';
import { logSecurityAudit } from './audit.js';

// ==================== INDEXEDDB OFFLINE QUEUE ====================
const DB_NAME = 'VocalWitnessOffline';
const STORE_NAME = 'pending_testimonies';
const DB_VERSION = 1;

export function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const dbInstance = e.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, {
          keyPath: 'id',
          autoIncrement: true,
        });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save pending testimony when offline (or forced queue).
 * payload should include { public, private } from prepareAnonymousSubmission
 * or a flat legacy draft.
 */
export async function saveDraftOffline(payload) {
  try {
    const dbInstance = await openOfflineDB();
    const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    const record = {
      ...payload,
      savedAt: Date.now(),
      status: 'pending',
    };

    await new Promise((resolve, reject) => {
      const req = store.add(record);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    return true;
  } catch (err) {
    console.error('IndexedDB Save Error:', err);
    return false;
  }
}

export async function getOfflineDrafts() {
  try {
    const dbInstance = await openOfflineDB();
    const tx = dbInstance.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);

    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('IndexedDB Retrieval Error:', err);
    return [];
  }
}

export async function removeOfflineDraft(id) {
  try {
    const dbInstance = await openOfflineDB();
    const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    await new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error('IndexedDB Removal Error:', err);
  }
}

export async function clearOfflineQueue() {
  try {
    const drafts = await getOfflineDrafts();
    await Promise.all(drafts.map((d) => removeOfflineDraft(d.id)));
  } catch (err) {
    console.error('Clear offline queue error:', err);
  }
}

/**
 * Single entry point for composer: online → publish; offline → queue.
 * @param {object} prepared - return value of prepareAnonymousSubmission
 */
export async function publishTestimonyOrQueue(prepared) {
  const publicData = prepared.public || prepared;
  const privateData = prepared.private || prepared._private || null;

  if (!navigator.onLine) {
    const ok = await saveDraftOffline({
      public: publicData,
      private: privateData,
      // legacy flat fields for older sync paths
      content: publicData.content,
      headline: publicData.headline,
      targetFeed: publicData.targetFeed,
      imageUrl: publicData.imageUrl,
      audioUrl: publicData.audioUrl,
      imageHash: publicData.imageHash,
      audioHash: publicData.audioHash,
      forensicHash: publicData.forensicHash,
      isAnonymous: publicData.isAnonymous,
      authorId: publicData.authorId,
      publicNullifier: publicData.publicNullifier,
    });

    if (ok) {
      showToast('Saved offline. Will publish when you are back online.', 'info');
      window.dispatchEvent(
        new CustomEvent('vocalWitness:queued', { detail: { offline: true } })
      );
      return { queued: true };
    }
    throw new Error('Could not save offline draft');
  }

  return publishTestimonyNow(publicData, privateData);
}

/**
 * Write public testimony + optional private tier contribution.
 */
export async function publishTestimonyNow(publicData, privateData = null) {
  let rawFeed = publicData.targetFeed || 'citizen_talk';
  const targetFeed =
    rawFeed === 'vocal_truth' || rawFeed === 'true_witness'
      ? 'witness_voice'
      : rawFeed;
  const isWitnessVoice =
    publicData.isWitnessVoice !== undefined
      ? publicData.isWitnessVoice
      : targetFeed === 'witness_voice';

  const isAnonymous = Boolean(publicData.isAnonymous);
  const user = auth?.currentUser;

  let authorTier = 'citizen';
  let authorWitnessLevel = null;
  if (user && !isAnonymous) {
    try {
      authorTier = (await getCurrentUserTier()) || 'citizen';
      const wl = await getCurrentWitnessLevel();
      authorWitnessLevel = wl?.name || null;
    } catch (_) {}
  }

  const testimonyRef = await addDoc(collection(db, 'testimonies'), {
    headline: publicData.headline || null,
    content: publicData.content || '',
    targetFeed,
    channel: targetFeed,
    isWitnessVoice,
    imageUrl: publicData.imageUrl || null,
    audioUrl: publicData.audioUrl || null,
    forensicHash:
      publicData.forensicHash ||
      publicData.imageHash ||
      publicData.audioHash ||
      null,
    imageHash: publicData.imageHash || null,
    audioHash: publicData.audioHash || null,
    // Batch 4 anonymity: null author on public doc when anonymous
    authorId: isAnonymous ? null : publicData.authorId || user?.uid || null,
    author: isAnonymous
      ? 'Anonymous Witness'
      : user?.displayName || publicData.author || 'Witness',
    isAnonymous,
    publicNullifier: isAnonymous ? publicData.publicNullifier || null : null,
    authorTier: isAnonymous ? null : authorTier,
    authorWitnessLevel: isAnonymous ? null : authorWitnessLevel,
    createdAt: serverTimestamp(),
    hasForensic: !!(
      publicData.forensicHash ||
      publicData.imageHash ||
      publicData.audioHash
    ),
    syncedFromOffline: Boolean(publicData.syncedFromOffline),
    originalOfflineTimestamp: publicData.originalOfflineTimestamp || null,
    status: 'published',
  });

  // Private tier credit (signed-in anonymous or identified)
  if (privateData?.countsTowardTier && user) {
    try {
      await addDoc(collection(db, 'userContributions'), {
        uid: user.uid,
        testimonyId: testimonyRef.id,
        isAnonymous: Boolean(privateData.isAnonymous),
        nullifierNonce: privateData.nullifierNonce ?? null,
        testimonyClientId: privateData.testimonyClientId || null,
        createdAt: serverTimestamp(),
      });
      // Optional: Cloud Function listens and increments reputation/tier
    } catch (err) {
      console.warn('Private contribution write failed (tier may lag):', err);
    }
  }

  try {
    await logSecurityAudit('TESTIMONY_PUBLISHED', testimonyRef.id, {
      targetFeed,
      isAnonymous,
      offline: Boolean(publicData.syncedFromOffline),
    });
  } catch (_) {}

  window.dispatchEvent(new CustomEvent('vocalWitness:posted'));
  return { id: testimonyRef.id, queued: false };
}

// ==================== USER PROFILE (unchanged logic) ====================
export const updateUserProfile = async (userId, updates) => {
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) throw new Error('User not found');

  const data = userSnap.data();
  const now = Date.now();

  const forbiddenKeys = [
    'role',
    'isBanned',
    'badges',
    'admin',
    'moderator',
    'zkVerified',
    'reputation',
    'score',
    'tier',
    'isVerified',
    'uid',
  ];
  const safeUpdates = { ...updates };
  forbiddenKeys.forEach((key) => delete safeUpdates[key]);

  if (safeUpdates.displayName && safeUpdates.displayName !== data.displayName) {
    const lastChange = data.lastNameChange || 0;
    const cooldownMs = 60 * 24 * 60 * 60 * 1000;
    if (now - lastChange < cooldownMs) {
      throw new Error('You can only change your name once every 60 days.');
    }
    safeUpdates.lastNameChange = now;
  }

  await updateDoc(userRef, {
    ...safeUpdates,
    updatedAt: serverTimestamp(),
  });
};

export const getUserData = async (userId) => {
  const userRef = doc(db, 'users', userId);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
};

// ==================== POST MANAGEMENT ====================
export const editPost = async (
  postId,
  userId,
  newContent,
  collectionName = 'testimonies'
) => {
  const docRef = doc(db, collectionName, postId);
  const snap = await getDoc(docRef);

  if (!snap.exists() || snap.data().authorId !== userId) {
    throw new Error('Not authorized to edit this content');
  }

  await updateDoc(docRef, {
    content: newContent.trim(),
    editedAt: serverTimestamp(),
  });
};

export const deletePost = async (
  postId,
  userId,
  collectionName = 'testimonies'
) => {
  const docRef = doc(db, collectionName, postId);
  const snap = await getDoc(docRef);

  if (!snap.exists() || snap.data().authorId !== userId) {
    throw new Error('Not authorized to delete this content');
  }

  await deleteDoc(docRef);
};

export const togglePinPost = async (
  postId,
  userId,
  collectionName = 'testimonies'
) => {
  const docRef = doc(db, collectionName, postId);
  const snap = await getDoc(docRef);

  if (!snap.exists() || snap.data().authorId !== userId) {
    throw new Error('Not authorized');
  }

  const post = snap.data();

  if (post.pinnedBy === userId) {
    await updateDoc(docRef, { pinnedBy: null, pinnedAt: null });
  } else {
    const pinnedQuery = query(
      collection(db, collectionName),
      where('pinnedBy', '==', userId)
    );
    const pinnedSnap = await getDocs(pinnedQuery);

    if (!pinnedSnap.empty) {
      throw new Error('You can only pin one item at a time.');
    }

    await updateDoc(docRef, {
      pinnedBy: userId,
      pinnedAt: serverTimestamp(),
    });
  }
};

export const getUserPosts = (userId, collectionName = 'testimonies') => {
  return query(collection(db, collectionName), where('authorId', '==', userId));
};

export const submitPeerVote = async (
  postId,
  type,
  collectionName = 'testimonies'
) => {
  const docRef = doc(db, collectionName, postId);

  try {
    await updateDoc(docRef, {
      [`votes.${type}`]: increment(1),
      lastUpdated: serverTimestamp(),
    });

    showToast(`Vote (${type}) recorded!`, 'success');
    return true;
  } catch (error) {
    console.error('Vote error:', error);
    showToast('Failed to record vote', 'error');
    return false;
  }
};

// ==================== OFFLINE SYNC ENGINE ====================
let isSyncing = false;

/**
 * Flush IndexedDB queue. Supports zero-registration (no auth) for anonymous public posts.
 * Private tier writes only when auth.currentUser exists.
 */
export async function syncOfflineDrafts() {
  if (isSyncing || !navigator.onLine) return;

  const drafts = await getOfflineDrafts();
  if (!drafts || drafts.length === 0) return;

  isSyncing = true;
  let syncedCount = 0;
  let failedCount = 0;

  showToast(`Syncing ${drafts.length} offline draft(s)...`, 'info');

  for (const draft of drafts) {
    try {
      const publicData = {
        ...(draft.public || draft),
        syncedFromOffline: true,
        originalOfflineTimestamp: draft.savedAt || draft.createdAt || null,
      };
      const privateData = draft.private || draft._private || null;

      // Allow anonymous sync without auth; identified/tier needs user
      if (!publicData.isAnonymous && !auth?.currentUser) {
        console.log('Skipping identified draft until auth restores');
        continue;
      }

      await publishTestimonyNow(publicData, privateData);
      await removeOfflineDraft(draft.id);
      syncedCount++;
    } catch (err) {
      console.error(`Failed to sync offline draft ID ${draft.id}:`, err);
      failedCount++;
    }
  }

  isSyncing = false;

  if (syncedCount > 0) {
    showToast(
      `✅ Successfully published ${syncedCount} offline testimony draft(s)!`,
      'success'
    );
  }

  if (failedCount > 0) {
    showToast(
      `⚠️ ${failedCount} draft(s) could not be synced. Retrying later.`,
      'error'
    );
  }
}

window.addEventListener('online', () => {
  console.log('Network online — syncing offline queue...');
  syncOfflineDrafts();
});

if (auth) {
  auth.onAuthStateChanged((user) => {
    if (navigator.onLine) {
      // Anonymous drafts can sync without user; identified drafts wait for user
      syncOfflineDrafts();
    }
  });
}
