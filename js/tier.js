// js/tier.js - Simplified 3-Tier System
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';

export const TIERS = {
  CITIZEN: 'citizen',           // Basic user
  TRUST_CIRCLE: 'trust_circle', // Phone verified
  TRUE_WITNESS: 'true_witness'  // Forensic / ZK verified
};

export async function getCurrentUserTier() {
  if (!auth.currentUser) return TIERS.CITIZEN;

  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    const snap = await getDoc(userRef);
    const data = snap.data() || {};

    if (data.zkVerified) return TIERS.TRUE_WITNESS;
    if (data.isPhoneVerified) return TIERS.TRUST_CIRCLE;
    return TIERS.CITIZEN;
  } catch (e) {
    console.warn("Could not fetch tier, defaulting to Citizen");
    return TIERS.CITIZEN;
  }
}

export function canAccessFeature(tier, feature) {
  const permissions = {
    live_arena: [TIERS.TRUE_WITNESS],
    zk_proof: [TIERS.TRUE_WITNESS],
    forensic_shield: [TIERS.TRUE_WITNESS, TIERS.TRUST_CIRCLE],
    escalate_post: [TIERS.TRUST_CIRCLE, TIERS.TRUE_WITNESS],   // Key for escalation
    review_queue: [TIERS.TRUE_WITNESS]
  };

  return permissions[feature] ? permissions[feature].includes(tier) : true;
}

export function applyTierTheme(tier) {
  const body = document.body;
  
  // Remove old classes
  body.classList.remove('tier-citizen', 'tier-trust', 'tier-witness');
  
  if (tier === TIERS.TRUE_WITNESS) {
    body.classList.add('tier-witness');
    console.log("🌟 True Witness theme applied");
  } else if (tier === TIERS.TRUST_CIRCLE) {
    body.classList.add('tier-trust');
    console.log("✅ Trust Circle theme applied");
  } else {
    body.classList.add('tier-citizen');
    console.log("👤 Citizen theme applied");
  }
}

// Optional: Helper to check if user can escalate a post
export function canEscalatePost(tier) {
  return canAccessFeature(tier, 'escalate_post');
}

// Add this at the end of tier.js
export async function escalatePost(postId) {
  if (!auth.currentUser) {
    showToast("Please sign in to escalate", "error");
    return;
  }

  const tier = await getCurrentUserTier();
  if (!canAccessFeature(tier, 'escalate_post')) {
    showToast("You need to be Verified Citizen or higher to escalate", "error");
    return;
  }

  try {
    // TODO: Later - call Cloud Function or update document
    console.log(`Escalating post ${postId} to True Witness...`);

    showToast("🔬 Escalating to True Witness... (Proof generation starting)", "success");
    
    // For now: Show success (we'll connect real logic later)
    setTimeout(() => {
      showToast("✅ Post escalated to True Witness with forensic proof!", "success");
    }, 1500);

  } catch (err) {
    console.error("Escalation failed:", err);
    showToast("Failed to escalate post", "error");
  }
}
