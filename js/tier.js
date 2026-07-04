import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';

export const TIERS = {
  CITIZEN: 'citizen',
  TRUST_CIRCLE: 'trust_circle',
  TRUE_WITNESS: 'true_witness'
};

export async function getCurrentUserTier() {
  if (!auth.currentUser) return TIERS.CITIZEN;
  try {
    const snap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const data = snap.data() || {};
    if (data.zkVerified) return TIERS.TRUE_WITNESS;
    if (data.isPhoneVerified) return TIERS.TRUST_CIRCLE;
    return TIERS.CITIZEN;
  } catch (e) {
    return TIERS.CITIZEN;
  }
}

export function canAccessFeature(tier, feature) {
  const perms = {
    live_arena: [TIERS.TRUE_WITNESS],
    zk_proof: [TIERS.TRUE_WITNESS],
    pdf_download: [TIERS.TRUE_WITNESS],
    forensic_shield: [TIERS.TRUE_WITNESS]
  };
  return perms[feature] ? perms[feature].includes(tier) : true;
}

export function applyTierTheme(tier) {
  // Add your theme logic here
  console.log(`Tier theme applied: ${tier}`);
}
