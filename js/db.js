// js/db.js
import { db } from './firebase-init.js';
import {
  doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

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
  
  // Logic: increment the specific vote count in Firestore
  // Ensure your Firestore security rules allow this update
  await updateDoc(postRef, {
    [`votes.${type}`]: (/* current count */) + 1, // You'll need to fetch current, or use increment()
    lastUpdated: serverTimestamp()
  });
  
  // Return success
  return true;
};
