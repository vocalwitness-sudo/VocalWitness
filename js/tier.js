// js/tier.js
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { auth } from './firebase-config.js';
import { showToast } from './utils.js';

export const TIERS = {
  CITIZEN: 'citizen',
  TRUST_CIRCLE: 'trust_circle',
  TRUE_WITNESS: 'true_witness'
};

export async function getCurrentUserTier() {
  if (!auth.currentUser) return TIERS.CITIZEN;
  try {
    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const data = userSnap.data() || {};
    if (data.zkVerified) return TIERS.TRUE_WITNESS;
    if (data.isPhoneVerified) return TIERS.TRUST_CIRCLE;
    return TIERS.CITIZEN;
  } catch (e) {
    return TIERS.CITIZEN;
  }
}

export function getTierInfo(tier) {
  const map = {
    [TIERS.CITIZEN]: { name: "Citizen", emoji: "🗣️", color: "zinc" },
    [TIERS.TRUST_CIRCLE]: { name: "Trust Circle", emoji: "🤝", color: "amber" },
    [TIERS.TRUE_WITNESS]: { name: "True Witness", emoji: "🛡️", color: "emerald" }
  };
  return map[tier] || map[TIERS.CITIZEN];
}

export function applyTierTheme(tier) {
  const info = getTierInfo(tier);
  document.body.classList.remove('tier-citizen', 'tier-trust', 'tier-witness');
  document.body.classList.add(`tier-${info.color}`);
  showToast(`👤 Switched to ${info.name}`, "info");
}

export function canAccessFeature(tier, feature) {
  const perms = {
    forensic_shield: [TIERS.TRUE_WITNESS],
    zk_proof: [TIERS.TRUE_WITNESS],
    escalate_post: [TIERS.TRUST_CIRCLE, TIERS.TRUE_WITNESS],
    live_arena: [TIERS.TRUE_WITNESS]
  };
  return perms[feature] ? perms[feature].includes(tier) : true;
}

export async function escalatePost(postId) {
  const tier = await getCurrentUserTier();
  if (!canAccessFeature(tier, 'escalate_post')) {
    showToast("Higher tier required to escalate", "error");
    return false;
  }
  showToast("🛡️ Escalation started (ZK proof coming soon)", "success");
  // TODO: Later - generate proof and update post status
  return true;
}
