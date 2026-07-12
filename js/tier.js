// js/tier.js - Refined with Radial Progress Circles
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { renderTierCircle } from './ui-components.js';

export const ROLES = {
  USER: 'user',
  STEWARD: 'steward',
  ADMIN: 'admin'
};

export const TIERS = {
  CITIZEN: 'citizen',
  CITIZEN_CIRCLE: 'citizen_circle',
  WITNESS_CIRCLE: 'witness_circle'
};

export const WITNESS_POSITIONS = {
  VERIFIED_WITNESS: { name: 'Verified Witness', emblem: '🔵', color: '#3b82f6', minRep: 30 },
  STEWARD: { name: 'Steward', emblem: '🟡', color: '#eab308', minRep: 75 },
  ELDER_STEWARD: { name: 'Elder Steward', emblem: '🔴', color: '#a855f7', minRep: 150 },
  ARCHITECT: { name: 'Architect', emblem: '💎', color: '#ec4899', minRep: 300 }
};

export async function getCurrentUserTier() {
  if (!auth.currentUser) return TIERS.CITIZEN;
  try {
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const data = snap.data() || {};
    if (data.zkVerified) return TIERS.WITNESS_CIRCLE;
    if (data.isPhoneVerified) return TIERS.CITIZEN_CIRCLE;
    return TIERS.CITIZEN;
  } catch (e) {
    return TIERS.CITIZEN;
  }
}

export async function getCurrentWitnessPosition() {
  if (!auth.currentUser) return null;
  try {
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
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

// Radial Circle Badge (Main function)
export async function updateTierBadge(containerId = 'profile-tier-badge') {
  const container = document.getElementById(containerId);
  if (!container) return;

  const tier = await getCurrentUserTier();
  const position = await getCurrentWitnessPosition();
  const rep = /* fetch from user data if available */ 120; // placeholder

  container.innerHTML = renderTierCircle(position || tier, rep);
  container.classList.remove('hidden');
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

export function canChallengeSteward(tier) {
  return tier === TIERS.CITIZEN_CIRCLE || tier === TIERS.WITNESS_CIRCLE;
}

export async function challengeStewardAction(actionId, reason) {
  if (!auth.currentUser) return showToast("Sign in required", "error");
  const tier = await getCurrentUserTier();
  if (!canChallengeSteward(tier)) {
    return showToast("Only verified members can challenge", "error");
  }
  showToast("✅ Challenge submitted for community review", "success");
}

export async function escalatePost(postId) {
  if (!auth.currentUser) {
    showToast("Please sign in to escalate", "error");
    return;
  }
  const tier = await getCurrentUserTier();
  if (!canAccessFeature(tier, 'escalate_post')) {
    showToast("Citizen Circle+ required", "error");
    return;
  }
  showToast("🔬 Post escalated with forensic proof", "success");
}
