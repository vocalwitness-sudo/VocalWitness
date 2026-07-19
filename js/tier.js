// js/tier.js - Enhanced Tier & Progression System
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';

export const TIERS = {
  CITIZEN: 'citizen',
  CITIZEN_CIRCLE: 'citizen_circle',     // Phone Verified
  WITNESS_CIRCLE: 'witness_circle'      // ZK Verified
};

// Witness Circle Progression Levels
export const WITNESS_LEVELS = {
  VERIFIED: {
    name: "Verified Witness",
    level: 1,
    emblem: "🔵",
    color: "#3b82f6",
    minRep: 30,
    benefits: ["Forensic Shield", "Basic Verification Badge"]
  },
  SILVER: {
    name: "Silver Witness",
    level: 2,
    emblem: "🥈",
    color: "#94a3b8",
    minRep: 80,
    benefits: ["Priority in Live Arena", "Create Groups", "Post Boost"]
  },
  GOLD: {
    name: "Gold Witness",
    level: 3,
    emblem: "🥇",
    color: "#eab308",
    minRep: 150,
    benefits: ["Advanced ZK Tools", "Content Promotion", "Higher Visibility"]
  },
  STEWARD: {
    name: "Steward",
    level: 4,
    emblem: "🟡",
    color: "#f59e0b",
    minRep: 300,
    benefits: ["Moderation Tools", "DAO Voting Power", "Escalate Posts"]
  },
  ELDER_STEWARD: {
    name: "Elder Steward",
    level: 5,
    emblem: "🔴",
    color: "#a855f7",
    minRep: 600,
    benefits: ["Review Queue Access", "Special Badge", "Platform Influence"]
  },
  ARCHITECT: {
    name: "Architect",
    level: 6,
    emblem: "💎",
    color: "#ec4899",
    minRep: 1000,
    benefits: ["Custom Features", "High Influence", "Legacy Status"]
  }
};

export const ROLES = {
  USER: 'user',
  STEWARD: 'steward',
  ADMIN: 'admin'
};

/**
 * Get current user's main tier
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
 * Get current Witness Level (only for WITNESS_CIRCLE users)
 */
export async function getCurrentWitnessLevel() {
  const tier = await getCurrentUserTier();
  if (tier !== TIERS.WITNESS_CIRCLE) return null;

  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    const rep = data.reputation || 0;

    // Return highest level achieved
    const levels = Object.values(WITNESS_LEVELS).reverse();
    for (const level of levels) {
      if (rep >= level.minRep) return level;
    }
    return WITNESS_LEVELS.VERIFIED;
  } catch (e) {
    return WITNESS_LEVELS.VERIFIED;
  }
}

/**
 * Check if user can access a feature
 */
export function canAccessFeature(feature) {
  const permissions = {
    live_arena: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    forensic_shield: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    create_group: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    escalate_post: [TIERS.WITNESS_CIRCLE],
    review_queue: [TIERS.WITNESS_CIRCLE],
    dao_proposal: [TIERS.WITNESS_CIRCLE],
    post_boost: [TIERS.SILVER, TIERS.GOLD, TIERS.STEWARD, TIERS.ELDER_STEWARD, TIERS.ARCHITECT], // Example
  };

  return permissions[feature] ? true : true; // Expand later
}

/**
 * Apply visual theme based on tier
 */
export function applyTierTheme() {
  const body = document.body;
  body.classList.remove('tier-citizen', 'tier-citizen-circle', 'tier-witness');

  getCurrentUserTier().then(tier => {
    if (tier === TIERS.WITNESS_CIRCLE) body.classList.add('tier-witness');
    else if (tier === TIERS.CITIZEN_CIRCLE) body.classList.add('tier-citizen-circle');
    else body.classList.add('tier-citizen');
  });
}

/**
 * Update profile badge with current level
 */
export async function updateTierBadge() {
  const badge = document.getElementById('profile-tier-badge');
  if (!badge) return;

  const tier = await getCurrentUserTier();
  const level = await getCurrentWitnessLevel();

  if (level) {
    badge.innerHTML = `${level.emblem} ${level.name}`;
    badge.style.backgroundColor = level.color;
    badge.style.color = "#fff";
  } else if (tier === TIERS.CITIZEN_CIRCLE) {
    badge.innerHTML = '🛡️ Citizen Circle';
    badge.style.backgroundColor = '#34d399';
  } else {
    badge.innerHTML = '👤 Citizen';
    badge.style.backgroundColor = '#6b7280';
  }
  badge.classList.remove('hidden');
}

// Refresh everything
export function refreshTierAndUI() {
  applyTierTheme();
  updateTierBadge();
  console.log("✅ Tier system & UI refreshed");
}
