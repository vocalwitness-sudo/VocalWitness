// js/tier.js - Refined with Citizen Circle / Witness Circle + Positions
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';

export const ROLES = {
  USER: 'user',
  STEWARD: 'steward',
  ADMIN: 'admin'
};

export const TIERS = {
  CITIZEN: 'citizen',
  CITIZEN_CIRCLE: 'citizen_circle',     // Phone Verified
  WITNESS_CIRCLE: 'witness_circle'      // ZK Verified (True Witness)
};

// Witness Circle Positions (inside ZK Verified tier)
export const WITNESS_POSITIONS = {
  VERIFIED_WITNESS: { name: 'Verified Witness', emblem: '🔵', color: '#3b82f6', minRep: 30 },
  STEWARD:          { name: 'Steward', emblem: '🟡', color: '#eab308', minRep: 75 },
  ELDER_STEWARD:    { name: 'Elder Steward', emblem: '🔴', color: '#a855f7', minRep: 150 },
  ARCHITECT:        { name: 'Architect', emblem: '💎', color: '#ec4899', minRep: 300 }
};

export async function getCurrentUserTier() {
  if (!auth.currentUser) return TIERS.CITIZEN;
  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    
    if (data.zkVerified) return TIERS.WITNESS_CIRCLE;
    if (data.isPhoneVerified) return TIERS.CITIZEN_CIRCLE;
    return TIERS.CITIZEN;
  } catch (e) {
    console.warn("Could not fetch tier, defaulting to Citizen");
    return TIERS.CITIZEN;
  }
}

export async function getCurrentWitnessPosition() {
  if (!auth.currentUser) return null;
  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};
    
    if (!data.zkVerified) return null;
    
    const rep = data.reputation || 0;
    if (rep >= 300) return WITNESS_POSITIONS.ARCHITECT;
    if (rep >= 150) return WITNESS_POSITIONS.ELDER_STEWARD;
    if (rep >= 75) return WITNESS_POSITIONS.STEWARD;
    return WITNESS_POSITIONS.VERIFIED_WITNESS;
  } catch (e) {
    return WITNESS_POSITIONS.VERIFIED_WITNESS;
  }
}

export function canAccessFeature(tier, feature) {
  const permissions = {
    live_arena: [TIERS.WITNESS_CIRCLE],
    zk_proof: [TIERS.WITNESS_CIRCLE],
    forensic_shield: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    escalate_post: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    review_queue: [TIERS.WITNESS_CIRCLE],
    dao_proposal: [TIERS.WITNESS_CIRCLE]
  };
  return permissions[feature] ? permissions[feature].includes(tier) : true;
}

export function applyTierTheme(tier) {
  const body = document.body;
  body.classList.remove('tier-citizen', 'tier-citizen-circle', 'tier-witness');
  
  if (tier === TIERS.WITNESS_CIRCLE) {
    body.classList.add('tier-witness');
    console.log("🌟 True Witness theme applied");
  } else if (tier === TIERS.CITIZEN_CIRCLE) {
    body.classList.add('tier-citizen-circle');
    console.log("✅ Citizen Circle theme applied");
  } else {
    body.classList.add('tier-citizen');
    console.log("👤 Citizen theme applied");
  }
}

export async function updateTierBadge() {
  const badge = document.getElementById('profile-tier-badge');
  if (!badge) return;

  const tier = await getCurrentUserTier();
  const position = await getCurrentWitnessPosition();

  badge.classList.remove('hidden');
  
  if (position) {
    badge.textContent = `${position.emblem} ${position.name}`;
    badge.style.backgroundColor = position.color;
  } else if (tier === TIERS.CITIZEN_CIRCLE) {
    badge.textContent = '🛡️ Citizen Circle';
    badge.style.backgroundColor = '#34d399';
  } else {
    badge.textContent = '👤 Citizen';
    badge.style.backgroundColor = '#6b7280';
  }
}

export function canEscalatePost(tier) {
  return canAccessFeature(tier, 'escalate_post');
}

// Keep your existing escalatePost function
export async function escalatePost(postId) {
  if (!auth.currentUser) {
    showToast("Please sign in to escalate", "error");
    return;
  }
  const tier = await getCurrentUserTier();
  if (!canEscalatePost(tier)) {
    showToast("You need to be in Citizen Circle or higher to escalate", "error");
    return;
  }
  try {
    showToast("🔬 Generating Forensic Proof...", "info");
    showToast("✅ Post escalated to Witness Circle with forensic proof!", "success");
    
    if (typeof window.loadFeed === 'function') {
      setTimeout(() => window.loadFeed('citizen-talk'), 800);
    }
  } catch (err) {
    console.error("Escalation failed:", err);
    showToast("Failed to escalate post", "error");
  }
}
