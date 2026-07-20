// js/db.js
import { db } from './firebase-config.js';
import {
  doc, 
  getDoc, 
  updateDoc, 
  deleteDoc, 
  collection, 
  query, 
  where, 
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import { showToast } from './utils.js';

// ==================== USER PROFILE ====================
/**
 * Update user profile with 60-day name change cooldown
 */
export const updateUserProfile = async (userId, updates) => {
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);

  if (!userSnap.exists()) throw new Error("User not found");

  const data = userSnap.data();
  const now = Date.now();

  // 60-day name change cooldown
  if (updates.displayName && updates.displayName !== data.displayName) {
    const lastChange = data.lastNameChange || 0;
    if (now - lastChange < 60 * 24 * 60 * 60 * 1000) {
      throw new Error("You can only change your name once every 60 days.");
    }
    updates.lastNameChange = now;
  }

  await updateDoc(userRef, {
    ...updates,
    updatedAt: serverTimestamp()
  });
};

export const getUserData = async (userId) => {
  const userRef = doc(db, "users", userId);
  const snap = await getDoc(userRef);
  return snap.exists() ? snap.data() : null;
};

// ==================== POST MANAGEMENT ====================
export const editPost = async (postId, userId, newContent) => {
  const postRef = doc(db, "posts", postId);
  const postSnap = await getDoc(postRef);

  if (!postSnap.exists() || postSnap.data().authorId !== userId) {
    throw new Error("Not authorized to edit this post");
  }

  await updateDoc(postRef, {
    content: newContent.trim(),
    editedAt: serverTimestamp()
  });
};

export const deletePost = async (postId, userId) => {
  const postRef = doc(db, "posts", postId);
  const postSnap = await getDoc(postRef);

  if (!postSnap.exists() || postSnap.data().authorId !== userId) {
    throw new Error("Not authorized to delete this post");
  }

  await deleteDoc(postRef);
};

export const togglePinPost = async (postId, userId) => {
  const postRef = doc(db, "posts", postId);
  const postSnap = await getDoc(postRef);

  if (!postSnap.exists() || postSnap.data().authorId !== userId) {
    throw new Error("Not authorized");
  }

  const post = postSnap.data();

  if (post.pinnedBy === userId) {
    // Unpin
    await updateDoc(postRef, { pinnedBy: null, pinnedAt: null });
  } else {
    // Check if user already has a pinned post
    const pinnedQuery = query(collection(db, "posts"), where("pinnedBy", "==", userId));
    const pinnedSnap = await getDocs(pinnedQuery);

    if (!pinnedSnap.empty) {
      throw new Error("You can only pin one post at a time.");
    }

    await updateDoc(postRef, {
      pinnedBy: userId,
      pinnedAt: serverTimestamp()
    });
  }
};

export const getUserPosts = (userId) => {
  return query(collection(db, "posts"), where("authorId", "==", userId));
};

/**
 * Handles peer verification/dispute
 */
export const submitPeerVote = async (postId, type) => {
    const postRef = doc(db, "posts", postId);
    
    try {
        // TODO: Better to use FieldValue.increment() for atomic updates
        await updateDoc(postRef, {
            [`votes.${type}`]: 1,
            lastUpdated: serverTimestamp()
        });
        
        showToast(`Vote ${type} recorded!`, "success");
        return true;
    } catch (error) {
        console.error("Vote error:", error);
        showToast("Failed to record vote", "error");
        return false;
    }
};
