// js/db.js - Database Operations & Offline Storage Engine (Batch 4 Hardened)
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
 * Save pending testimony when offline.
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

    return new Promise((resolve, reject) => {
      store.add(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error || tx.error);
      tx.onabort = (e) => reject(e.target.error || tx.error);
    });
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

    return new Promise((resolve, reject) => {
      store.delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
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
 * Force drops the entire IndexedDB instance.
 */
export async function dropOfflineDatabase() {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = () => resolve(false);
    req.onblocked = () => resolve(false);
  });
}

/**
 * Helper to normalize feed names across historical and renamed keys.
 */
function normalizeFeedTarget(feedInput) {
  const raw = (feedInput || '').toLowerCase().trim();
  if (raw === 'vocal_truth' || raw === 'true_witness' || raw === 'witness_voice') {
    return 'witness_voice';
  }
  return 'citizen_talk';
}

/**
 * Single entry point for composer: online → publish; offline → queue.
 */
export async function publishTestimonyOrQueue(prepared) {
  const publicData = prepared.public || prepared;
  const privateData = prepared.private || prepared._private || null;

  // Canonical title/headline resolution
  const resolvedHeading = publicData.title || publicData.headline || null;

  if (!navigator.onLine) {
    const targetFeed = normalizeFeedTarget(publicData.targetFeed);
    const ok = await saveDraftOffline({
      public: { 
        ...publicData, 
        targetFeed,
        title: resolvedHeading,
        headline: resolvedHeading,
      },
      private: privateData,
      content: publicData.content,
      title: resolvedHeading,
      headline: resolvedHeading,
      targetFeed,
      imageUrl: publicData.imageUrl,
      audioUrl: publicData.audioUrl,
      imageHash: publicData.imageHash,
      audioHash: publicData.audioHash,
      forensicHash: publicData.forensicHash,
      mediaMetadata: publicData.mediaMetadata || null,
      mediaOriginClaim: publicData.mediaOriginClaim || 'none',
      syntheticScore: publicData.syntheticScore ?? 0,
      syntheticAdvisory: publicData.syntheticAdvisory || 'LOW_SYNTHETIC_PROBABILITY',
      provenance: publicData.mediaMetadata?.provenance || publicData.provenance || 'unverified',
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
 * @deprecated Prefer submitTestimony() from createPost.js
 * Thin wrapper so offline queue / old callers stay safe.
 * Does NOT client-write testimonies (no addDoc).
 */
export async function publishTestimonyNow(publicData, privateData = null) {
  const user = auth?.currentUser;
  const isAnonymous = Boolean(publicData?.isAnonymous);

  if (!isAnonymous && !user) {
    throw new Error('Authentication required to publish identified testimony');
  }

  const targetFeed = normalizeFeedTarget(publicData?.targetFeed);
  const isWitnessVoice =
    publicData?.isWitnessVoice !== undefined
      ? publicData.isWitnessVoice
      : targetFeed === 'witness_voice';

  const channel =
    isWitnessVoice ||
    targetFeed === 'witness_voice' ||
    targetFeed === 'witness-voice' ||
    publicData?.channel === 'witness-voice'
      ? 'witness-voice'
      : 'citizen-talk';

  const postingStyle =
    publicData?.postingStyle === 'field-note' ? 'field-note' : 'citizen';
  const fieldNoteRole =
    postingStyle === 'field-note' ? (publicData?.fieldNoteRole || null) : null;
  const fieldNoteOrg =
    postingStyle === 'field-note' ? (publicData?.fieldNoteOrg || null) : null;

  const content = (publicData?.content || '').trim();
  if (!content) {
    throw new Error('Testimony content is required');
  }

  // Secure path only — no client addDoc
  const { submitTestimony } = await import('./createPost.js');

  const id = await submitTestimony({
    content,
    channel,
    isAnonymous,
    postingStyle,
    fieldNoteRole,
    fieldNoteOrg,
    imageFile: publicData?.imageFile || null,
    videoFile: publicData?.videoFile || null,
    audioFile: publicData?.audioFile || null,
    mediaFile: publicData?.mediaFile || null,
  });

  // Optional private tier contribution (separate collection)
  if (privateData?.countsTowardTier && user) {
    try {
      await addDoc(collection(db, 'userContributions'), {
        uid: user.uid,
        testimonyId: id,
        isAnonymous: Boolean(privateData.isAnonymous),
        nullifierNonce: privateData.nullifierNonce ?? null,
        testimonyClientId: privateData.testimonyClientId || null,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Private contribution write failed:', err);
    }
  }

  try {
    await logSecurityAudit('TESTIMONY_PUBLISHED', id, {
      targetFeed,
      isAnonymous,
      offline: Boolean(publicData?.syncedFromOffline),
      via: 'publishTestimonyNow→submitTestimony',
    });
  } catch (_) {}

  window.dispatchEvent(new CustomEvent('vocalWitness:posted', { detail: { id } }));
  return { id, queued: false };
}

// ==================== USER PROFILE ====================
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
export const editPost = async (postId, userId, newContent, collectionName = 'testimonies') => {
  const docRef = doc(db, collectionName, postId);
  const snap = await getDoc(docRef);

  if (!snap.exists() || snap.data().authorId !== userId) {
    throw new Error('Not authorized to edit this content');
  }

  const data = snap.data();
  const created = data.createdAt?.toDate ? data.createdAt.toDate() : null;
  if (created) {
    const ageMs = Date.now() - created.getTime();
    if (ageMs > 30 * 60 * 1000) {
      throw new Error('Text can only be edited within 30 minutes of publishing.');
    }
  }

  const trimmed = (newContent || '').trim();
  if (!trimmed || trimmed.length > 3000) {
    throw new Error('Content must be 1–3000 characters.');
  }

  // Only fields allowed by isSafeAuthorTestimonyUpdate inside correction window
  await updateDoc(docRef, {
    content: trimmed,
    updatedAt: serverTimestamp(),
  });
};
/**
 * Soft-hide only. Sealed hashes and media remain for verification.
 * Matches firestore.rules isSafeAuthorTestimonyUpdate hide path.
 */
export const deletePost = async (postId, userId, collectionName = 'testimonies') => {
  const docRef = doc(db, collectionName, postId);
  const snap = await getDoc(docRef);

  if (!snap.exists() || snap.data().authorId !== userId) {
    throw new Error('Not authorized to hide this content');
  }

  await updateDoc(docRef, {
    visibility: 'author_hidden',
    isDeleted: true,
    hiddenAt: serverTimestamp(),
    hiddenBy: userId,
    hiddenReason: 'author_request',
    updatedAt: serverTimestamp(),
  });
}

export const togglePinPost = async (postId, userId, collectionName = 'testimonies') => {
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

export const submitPeerVote = async (postId, type, collectionName = 'testimonies') => {
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
const activeSyncIds = new Set();

export async function syncOfflineDrafts() {
  if (isSyncing || !navigator.onLine) return;

  const drafts = await getOfflineDrafts();
  if (!drafts || drafts.length === 0) return;

  isSyncing = true;
  let syncedCount = 0;
  let failedCount = 0;

  showToast(`Syncing ${drafts.length} offline draft(s)...`, 'info');

  const { submitTestimony } = await import('./createPost.js');

  for (const draft of drafts) {
    if (activeSyncIds.has(draft.id)) continue;
    activeSyncIds.add(draft.id);

    try {
      if (!auth?.currentUser) {
        console.log('Skipping draft until auth restores');
        activeSyncIds.delete(draft.id);
        continue;
      }

      // Prefer text-only offline drafts; media should be re-attached online
      if (draft.hasMediaPending && !draft.imageUrl && !draft.audioUrl && !draft.videoUrl) {
        console.warn('Skipping media draft that needs re-upload:', draft.id);
        failedCount++;
        activeSyncIds.delete(draft.id);
        continue;
      }

      const content = draft.content || draft.public?.content || '';
      const channel = draft.channel || draft.public?.channel || 'citizen-talk';

      await submitTestimony({
        content,
        channel,
        isAnonymous: !!(draft.isAnonymous || draft.public?.isAnonymous),
        postingStyle: draft.postingStyle || draft.public?.postingStyle || 'citizen',
        fieldNoteRole: draft.fieldNoteRole || draft.public?.fieldNoteRole || null,
        fieldNoteOrg: draft.fieldNoteOrg || draft.public?.fieldNoteOrg || null,
      });

      await removeOfflineDraft(draft.id);
      syncedCount++;
    } catch (err) {
      console.error(`Failed to sync offline draft ID ${draft.id}:`, err);
      failedCount++;
    } finally {
      activeSyncIds.delete(draft.id);
    }
  }

  isSyncing = false;

  if (syncedCount > 0) {
    showToast(`✅ Published ${syncedCount} offline draft(s)!`, 'success');
  }
  if (failedCount > 0) {
    showToast(`⚠️ ${failedCount} draft(s) could not sync. Retry later.`, 'error');
  }
}

window.addEventListener('online', () => {
  console.log('Network online — syncing offline queue...');
  syncOfflineDrafts();
});

if (auth) {
  auth.onAuthStateChanged((user) => {
    if (navigator.onLine && user) {
      syncOfflineDrafts();
    }
  });
}

// Global window bindings for legacy modules
window.saveDraftOffline = saveDraftOffline;
window.getOfflineDrafts = getOfflineDrafts;
window.publishTestimonyOrQueue = publishTestimonyOrQueue;
window.publishTestimonyNow = publishTestimonyNow;
window.getUserData = getUserData;
window.syncOfflineDrafts = syncOfflineDrafts;
