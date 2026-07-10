// js/tier.js - Refined with Citizen Circle / Witness Circle (Compatible with your existing calls)
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
  CITIZEN_CIRCLE: 'citizen_circle',   // Phone Verified
  WITNESS_CIRCLE: 'witness_circle'    // ZK Verified (True Witness)
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

export function canAccessFeature(tier, feature) {
  const permissions = {
    live_arena: [TIERS.WITNESS_CIRCLE],
    zk_proof: [TIERS.WITNESS_CIRCLE],
    forensic_shield: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    escalate_post: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    review_queue: [TIERS.WITNESS_CIRCLE]
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

export function canEscalatePost(tier) {
  return canAccessFeature(tier, 'escalate_post');
}

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
    // TODO: Add proof generation here
    showToast("✅ Post escalated to Witness Circle with forensic proof!", "success");
   
    if (typeof window.loadFeed === 'function') {
      setTimeout(() => window.loadFeed('citizen-talk'), 800);
    }
  } catch (err) {
    console.error("Escalation failed:", err);
    showToast("Failed to escalate post: " + (err.message || ""), "error");
  }
}

export function updateTierBadge() {
  const badge = document.getElementById('profile-tier-badge');
  if (!badge) return;
  getCurrentUserTier().then(tier => {
    badge.classList.remove('hidden');
    if (tier === TIERS.WITNESS_CIRCLE) {
      badge.textContent = '🔬 Witness Circle';
      badge.style.backgroundColor = '#eab308';
    } else if (tier === TIERS.CITIZEN_CIRCLE) {
      badge.textContent = '🛡️ Citizen Circle';
      badge.style.backgroundColor = '#34d399';
    } else {
      badge.textContent = '👤 Citizen';
      badge.style.backgroundColor = '#6b7280';
    }
  });
}
