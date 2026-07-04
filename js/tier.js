// js/tier.js - Improved for your project
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { showToast } from './utils.js';

export const TIERS = {
  CITIZEN: 'citizen',
  TRUST_CIRCLE: 'trust_circle',
  TRUE_WITNESS: 'true_witness'
};

export async function getCurrentUserTier() {
  const user = auth.currentUser; // Make sure auth is imported
  if (!user) return TIERS.CITIZEN;

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const data = userDoc.data() || {};
    
    if (data.zkVerified === true) return TIERS.TRUE_WITNESS;
    if (data.isPhoneVerified === true) return TIERS.TRUST_CIRCLE;
    return TIERS.CITIZEN;
  } catch (e) {
    console.error("Tier fetch error", e);
    return TIERS.CITIZEN;
  }
}

export function getTierInfo(tier) {
  const map = {
    [TIERS.CITIZEN]: { name: "Citizen Talk", emoji: "🗣️", color: "zinc", theme: "neutral" },
    [TIERS.TRUST_CIRCLE]: { name: "Trust Circle", emoji: "🤝", color: "amber", theme: "trusted" },
    [TIERS.TRUE_WITNESS]: { name: "True Witness", emoji: "🛡️", color: "emerald", theme: "forensic" }
  };
  return map[tier] || map[TIERS.CITIZEN];
}

// Apply visual theme to page
export function applyTierTheme(tier) {
  const info = getTierInfo(tier);
  document.documentElement.style.setProperty('--accent-color', 
    info.theme === 'forensic' ? '#10b981' : info.theme === 'trusted' ? '#f59e0b' : '#64748b');
  
  // You can add body class for CSS targeting
  document.body.classList.remove('tier-citizen', 'tier-trust', 'tier-witness');
  document.body.classList.add(`tier-${info.theme}`);
}

// Check if user can do something
export function canAccessFeature(tier, feature) {
  const permissions = {
    forensic_shield: [TIERS.TRUE_WITNESS],
    zk_proof: [TIERS.TRUE_WITNESS],
    escalate_post: [TIERS.TRUST_CIRCLE, TIERS.TRUE_WITNESS],
    live_arena: [TIERS.TRUE_WITNESS],           // As you requested
    review_queue: [TIERS.TRUE_WITNESS],
    basic_post: [TIERS.CITIZEN, TIERS.TRUST_CIRCLE, TIERS.TRUE_WITNESS]
  };
  return permissions[feature] ? permissions[feature].includes(tier) : true;
}

// Escalate a post from Citizen Talk to True Witness
export async function escalatePost(postId, postData) {
  const tier = await getCurrentUserTier();
  if (!canAccessFeature(tier, 'escalate_post')) {
    showToast("Only verified users can escalate to True Witness", "error");
    return false;
  }

  // TODO: Later we will call proof generation here
  showToast("🛡️ Escalating to True Witness... (Proof generation next)", "info");
  
  // For now: mark the post
  // await updateDoc(doc(db, "testimonies", postId), { 
  //   status: "escalated", 
  //   escalatedAt: new Date().toISOString() 
  // });
  
  return true;
}
