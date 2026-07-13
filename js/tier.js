// js/tier.js - Tier & Role System (Citizen → Citizen Circle → Witness Circle)
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';

export const TIERS = {
  CITIZEN: 'citizen',           // Email/password only
  CITIZEN_CIRCLE: 'citizen_circle',   // + Phone Verified
  WITNESS_CIRCLE: 'witness_circle'    // + ZK Proof Verified (True Witness)
};

export const WITNESS_POSITIONS = {
  VERIFIED_WITNESS: { 
    name: 'Verified Witness', 
    emblem: '🔵', 
    color: '#3b82f6', 
    minRep: 30 
  },
  STEWARD: { 
    name: 'Steward', 
    emblem: '🟡', 
    color: '#eab308', 
    minRep: 75 
  },
  ELDER_STEWARD: { 
    name: 'Elder Steward', 
    emblem: '🔴', 
    color: '#a855f7', 
    minRep: 150 
  },
  ARCHITECT: { 
    name: 'Architect', 
    emblem: '💎', 
    color: '#ec4899', 
    minRep: 300 
  }
};

export const ROLES = {
  USER: 'user',
  STEWARD: 'steward',
  ADMIN: 'admin'
};

/**
 * Get current user's tier
 */
export async function getCurrentUserTier() {
  if (!auth.currentUser) return TIERS.CITIZEN;

  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};

    if (data.zkVerified === true) return TIERS.WITNESS_CIRCLE;
    if (data.isPhoneVerified === true) return TIERS.CITIZEN_CIRCLE;
    return TIERS.CITIZEN;
  } catch (e) {
    console.warn("Tier fetch failed, defaulting to CITIZEN", e);
    return TIERS.CITIZEN;
  }
}

/**
 * Get Witness Position (only for WITNESS_CIRCLE users)
 */
export async function getCurrentWitnessPosition() {
  const tier = await getCurrentUserTier();
  if (tier !== TIERS.WITNESS_CIRCLE) return null;

  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const rep = data.reputation || 0;

    for (const pos of Object.values(WITNESS_POSITIONS).reverse()) {
      if (rep >= pos.minRep) return pos;
    }
    return WITNESS_POSITIONS.VERIFIED_WITNESS;
  } catch (e) {
    return WITNESS_POSITIONS.VERIFIED_WITNESS;
  }
}

/**
 * Permission checker
 */
export function canAccessFeature(feature) {
  const permissions = {
    live_arena: [TIERS.WITNESS_CIRCLE],
    zk_proof: [TIERS.WITNESS_CIRCLE],
    forensic_shield: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    escalate_post: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    review_queue: [TIERS.WITNESS_CIRCLE],
    dao_proposal: [TIERS.WITNESS_CIRCLE],
    create_group: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],   // Example
  };

  return permissions[feature] 
    ? permissions[feature].includes(getCurrentUserTier()) // Note: sync call needs care
    : true;
}

/**
 * Apply visual theme based on tier
 */
export function applyTierTheme() {
  const body = document.body;
  body.classList.remove('tier-citizen', 'tier-citizen-circle', 'tier-witness');

  getCurrentUserTier().then(tier => {
    if (tier === TIERS.WITNESS_CIRCLE) {
      body.classList.add('tier-witness');
    } else if (tier === TIERS.CITIZEN_CIRCLE) {
      body.classList.add('tier-citizen-circle');
    } else {
      body.classList.add('tier-citizen');
    }
  });
}

/**
 * Update profile badge
 */
export async function updateTierBadge() {
    const badge = document.getElementById('profile-tier-badge');
    if (!badge) return;

    const tier = await getCurrentUserTier();
    const position = await getCurrentWitnessPosition();

    if (position) {
        badge.innerHTML = `${position.emblem} ${position.name}`;
        badge.style.backgroundColor = position.color;
    } else if (tier === TIERS.CITIZEN_CIRCLE) {
        badge.innerHTML = '🛡️ Citizen Circle';
        badge.style.backgroundColor = '#34d399';
    } else {
        badge.innerHTML = '👤 Citizen';
        badge.style.backgroundColor = '#6b7280';
    }
    badge.classList.remove('hidden');
}
// Helper functions
export function isAtLeast(tierToCheck) {
  const current = getCurrentUserTier(); // Note: this is async in real use
  // Better to await when calling
}

export function refreshTierAndUI() {
    if (typeof applyTierTheme === 'function') applyTierTheme();
    if (typeof updateTierBadge === 'function') updateTierBadge();
    console.log("✅ Tier UI refreshed");
}
// TODO: Add your escalatePost function here later
export async function escalatePost(postId) {
    console.log("Escalate post called for ID:", postId);
    showToast("Escalation feature coming soon", "info");
}
