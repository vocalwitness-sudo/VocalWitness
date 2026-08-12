// js/db.js - Database Operations & Offline Storage Engine
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
  increment
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import { showToast } from './utils.js';
import { getCurrentUserTier, getCurrentWitnessLevel } from './tier.js';
import { logSecurityAudit } from './audit.js';

// ==================== INDEXEDDB OFFLINE QUEUE ====================
const DB_NAME = 'VocalWitnessOffline';
const STORE_NAME = 'pending_testimonies';

/**
 * Initialize or retrieve the local IndexedDB database for offline resilience
 */
export function openOfflineDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      const dbInstance = e.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Save pending testimony draft locally when offline
 */
export async function saveDraftOffline(payload) {
  try {
    const dbInstance = await openOfflineDB();
    const tx = dbInstance.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    
    await new Promise((resolve, reject) => {
      const req = store.add({ ...payload, savedAt: Date.now() });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    
    return true;
  } catch (err) {
    console.error("IndexedDB Save Error:", err);
    return false;
  }
}

/**
 * Fetch all buffered offline drafts
 */
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
    console.error("IndexedDB Retrieval Error:", err);
    return [];
  }
}

/**
 * Clear synchronized item from IndexedDB queue
 */
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
    console.error("IndexedDB Removal Error:", err);
  }
}


// ==================== USER PROFILE ====================
/**
 * Update user profile enforcing safety rules & 60-day name change cooldown
 */
export const updateUserProfile = async (userId, updates) => {
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) throw new Error("User not found");

  const data = userSnap.data();
  const now = Date.now();

  // Strip forbidden security keys to avoid triggering security rule rejections
  const forbiddenKeys = ['role', 'isBanned', 'badges', 'admin', 'moderator', 'zkVerified', 'reputation', 'score', 'tier', 'isVerified', 'uid'];
  const safeUpdates = { ...updates };
  forbiddenKeys.forEach(key => delete safeUpdates[key]);

  // 60-day name change cooldown
  if (safeUpdates.displayName && safeUpdates.displayName !== data.displayName) {
    const lastChange = data.lastNameChange || 0;
    const cooldownMs = 60 * 24 * 60 * 60 * 1000; // 60 Days
    if (now - lastChange < cooldownMs) {
      throw new Error("You can only change your name once every 60 days.");
    }
    safeUpdates.lastNameChange = now;
  }

  await updateDoc(userRef, {
    ...safeUpdates,
    updatedAt: serverTimestamp()
  });
};

export const getUserData = async (userId) => {
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
};


// ==================== POST & TESTIMONY MANAGEMENT ====================
/**
 * Edit testimony or post content safely
 */
export const editPost = async (postId, userId, newContent, collectionName = "testimonies") => {
  const docRef = doc(db, collectionName, postId);
  const snap = await getDoc(docRef);

  if (!snap.exists() || snap.data().authorId !== userId) {
    throw new Error("Not authorized to edit this content");
  }

  await updateDoc(docRef, {
    content: newContent.trim(),
    editedAt: serverTimestamp()
  });
};

/**
 * Delete testimony or post
 */
export const deletePost = async (postId, userId, collectionName = "testimonies") => {
  const docRef = doc(db, collectionName, postId);
  const snap = await getDoc(docRef);

  if (!snap.exists() || snap.data().authorId !== userId) {
    throw new Error("Not authorized to delete this content");
  }

  await deleteDoc(docRef);
};

/**
 * Pin single post/testimony per user
 */
export const togglePinPost = async (postId, userId, collectionName = "testimonies") => {
  const docRef = doc(db, collectionName, postId);
  const snap = await getDoc(docRef);

  if (!snap.exists() || snap.data().authorId !== userId) {
    throw new Error("Not authorized");
  }

  const post = snap.data();

  if (post.pinnedBy === userId) {
    // Unpin
    await updateDoc(docRef, { pinnedBy: null, pinnedAt: null });
  } else {
    // Verify no existing pinned items exist
    const pinnedQuery = query(collection(db, collectionName), where("pinnedBy", "==", userId));
    const pinnedSnap = await getDocs(pinnedQuery);

    if (!pinnedSnap.empty) {
      throw new Error("You can only pin one item at a time.");
    }

    await updateDoc(docRef, {
      pinnedBy: userId,
      pinnedAt: serverTimestamp()
    });
  }
};

/**
 * Get all testimonies/posts by author
 */
export const getUserPosts = (userId, collectionName = "testimonies") => {
  return query(collection(db, collectionName), where("authorId", "==", userId));
};

/**
 * Handles peer verification or dispute atomic increments
 */
export const submitPeerVote = async (postId, type, collectionName = "testimonies") => {
  const docRef = doc(db, collectionName, postId);
  
  try {
    await updateDoc(docRef, {
      [`votes.${type}`]: increment(1),
      lastUpdated: serverTimestamp()
    });
    
    showToast(`Vote (${type}) recorded!`, "success");
    return true;
  } catch (error) {
    console.error("Vote error:", error);
    showToast("Failed to record vote", "error");
    return false;
  }
};


// ==================== AUTOMATED OFFLINE SYNC ENGINE ====================
let isSyncing = false;

/**
 * Process and upload queued IndexedDB drafts when online connectivity is restored
 */
export async function syncOfflineDrafts() {
  if (isSyncing || !navigator.onLine) return;
  if (!auth.currentUser) return; // Wait until Firebase Auth restores active user

  const drafts = await getOfflineDrafts();
  if (!drafts || drafts.length === 0) return;

  isSyncing = true;
  let syncedCount = 0;
  let failedCount = 0;

  showToast(`Syncing ${drafts.length} offline draft(s)...`, 'info');

  for (const draft of drafts) {
    try {
      // Feed Alias Normalization
      let rawFeed = draft.targetFeed || "citizen_talk";
      const targetFeed = (rawFeed === 'vocal_truth' || rawFeed === 'true_witness') ? 'witness_voice' : rawFeed;

      const currentUserId = auth.currentUser?.uid || draft.authorId;
      const userTier = await getCurrentUserTier();
      const userWitnessLevel = await getCurrentWitnessLevel();

      // Write draft to Firestore testimonies collection
      const testimonyRef = await addDoc(collection(db, "testimonies"), {
        content: draft.content || "",
        targetFeed: targetFeed,
        imageUrl: draft.imageUrl || null,
        audioUrl: draft.audioUrl || null,
        forensicHash: draft.forensicHash || draft.imageHash || draft.audioHash || null,
        authorId: currentUserId,
        author: auth.currentUser?.displayName || "Anonymous Witness",
        authorTier: userTier || 'citizen',
        authorWitnessLevel: userWitnessLevel?.name || null,
        createdAt: serverTimestamp(),
        syncedFromOffline: true,
        originalOfflineTimestamp: draft.savedAt || draft.createdAt,
        status: 'published'
      });

      // Audit log entry
      await logSecurityAudit('OFFLINE_TESTIMONY_SYNCED', testimonyRef.id, {
        targetFeed: targetFeed,
        originalSavedAt: draft.savedAt
      });

      // Remove from IndexedDB queue upon success
      await removeOfflineDraft(draft.id);
      syncedCount++;

    } catch (err) {
      console.error(`Failed to sync offline draft ID ${draft.id}:`, err);
      failedCount++;
    }
  }

  isSyncing = false;

  if (syncedCount > 0) {
    showToast(`✅ Successfully published ${syncedCount} offline testimony draft(s)!`, 'success');
    window.dispatchEvent(new CustomEvent('vocalWitness:posted'));
  }

  if (failedCount > 0) {
    showToast(`⚠️ ${failedCount} draft(s) could not be synced. Retrying later.`, 'error');
  }
}

// Automatically sync when online event triggers
window.addEventListener('online', () => {
  console.log("Network online event detected. Initializing sync...");
  syncOfflineDrafts();
});

// Trigger sync when Firebase Auth completes initialization
if (typeof auth !== 'undefined') {
  auth.onAuthStateChanged((user) => {
    if (user && navigator.onLine) {
      syncOfflineDrafts();
    }
  });
}
