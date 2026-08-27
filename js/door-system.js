// js/door-system.js - Enhanced Door & Room Access Control
import { auth, db } from './firebase-config.js';
import { doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getCurrentUserTier, getCurrentWitnessLevel, hasStewardAccess, TIERS } from './tier.js';

// ====================== PRIVACY MODES ======================
export const PRIVACY_MODES = {
  OPEN: 'open',
  ZK_ONLY: 'zk_only',
  CLOSED: 'closed'
};

/**
 * Update the user's door privacy mode (OPEN / ZK_ONLY / CLOSED)
 */
export async function setDoorPrivacyMode(mode) {
  if (!auth.currentUser) {
    throw new Error('You must be signed in to change privacy settings');
  }

  if (!Object.values(PRIVACY_MODES).includes(mode)) {
    throw new Error('Invalid privacy mode');
  }

  // ZK_ONLY requires higher verification
  if (mode === PRIVACY_MODES.ZK_ONLY) {
    const tier = await getCurrentUserTier();
    if (tier !== TIERS.WITNESS_CIRCLE) {
      throw new Error('ZK-Only Shield requires Witness Circle verification');
    }
  }

  const userRef = doc(db, 'users', auth.currentUser.uid);
  await updateDoc(userRef, {
    doorPrivacyMode: mode,
    updatedAt: new Date()
  });

  return true;
}

/**
 * Check whether the current user is allowed to interact (reply) with another user
 * based on the target user's door privacy setting.
 */
export function canInteractWithUser(targetUser, currentUser) {
  if (!targetUser) return true;

  const mode = targetUser.doorPrivacyMode || PRIVACY_MODES.OPEN;

  // Open door → everyone can interact
  if (mode === PRIVACY_MODES.OPEN) return true;

  // Closed door → only the author themselves
  if (mode === PRIVACY_MODES.CLOSED) {
    return currentUser?.uid === targetUser.uid;
  }

  // ZK_ONLY → only verified (phone or ZK) users + the author
  if (mode === PRIVACY_MODES.ZK_ONLY) {
    if (currentUser?.uid === targetUser.uid) return true;
    // Adjust these checks to match your real state shape
    return !!(
      currentUser?.isPhoneVerified ||
      currentUser?.zkVerified ||
      currentUser?.userTier === TIERS.WITNESS_CIRCLE ||
      currentUser?.userTier === 'witness_circle'
    );
  }

  return true;
}

// ====================== EXISTING DOOR ACCESS LOGIC ======================

/**
 * Determine which doors a user is cleared to open based on their Tier & Witness Level
 */
export async function getUserDoors() {
  const doors = ['public_square']; // Everyone opens the public square
  if (!auth.currentUser) return doors;

  try {
    const tier = await getCurrentUserTier();
    const witnessLevel = await getCurrentWitnessLevel();
    const isSteward = await hasStewardAccess();

    if (tier === TIERS.CITIZEN_CIRCLE || tier === TIERS.WITNESS_CIRCLE) {
      doors.push('citizen_circle');
    }
    if (tier === TIERS.WITNESS_CIRCLE) {
      doors.push('witness_circle');
    }
    if (isSteward) {
      doors.push('steward_apartment'); // The exclusive moderation suite
    }
    return doors;
  } catch (e) {
    console.warn('Failed to evaluate user doors, defaulting to public', e);
    return ['public_square'];
  }
}

export async function canAccessDoor(door) {
  const doors = await getUserDoors();
  return doors.includes(door);
}

export async function getCurrentDoor() {
  if (!auth.currentUser) return 'public_square';
  try {
    const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    return snap.data()?.currentVisibilityDoor || 'public_square';
  } catch (e) {
    return 'public_square';
  }
}

/**
 * Switch the user's active viewing room/door
 */
export async function switchUserDoor(doorName) {
  if (!auth.currentUser) return false;

  const allowed = await canAccessDoor(doorName);
  if (!allowed) {
    throw new Error('Access denied: You lack the required verification tier for this room.');
  }

  const userRef = doc(db, 'users', auth.currentUser.uid);
  await updateDoc(userRef, {
    currentVisibilityDoor: doorName
  });
  return true;
}

// Filter feed based on user's current door clearance
export function filterPostsByDoor(posts, userDoor) {
  return posts.filter(post => {
    const postDoor = post.visibilityDoor || 'public_square';
    const doorLevels = {
      'public_square': 1,
      'citizen_circle': 2,
      'witness_circle': 3,
      'steward_apartment': 4
    };
    const userLevel = doorLevels[userDoor] || 1;
    const postLevel = doorLevels[postDoor] || 1;
    // Users can view posts belonging to their door level or lower
    return postLevel <= userLevel;
  });
}
