// js/tier.js - Simplified 3-Tier System
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';

// Import the proof function (add this line)
import { generateRigorousProof } from './zk-crypto.js';

export const TIERS = {
  CITIZEN: 'citizen',
  TRUST_CIRCLE: 'trust_circle',
  TRUE_WITNESS: 'true_witness'
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
    escalate_post: [TIERS.TRUST_CIRCLE, TIERS.TRUE_WITNESS],
    review_queue: [TIERS.TRUE_WITNESS]
  };
  return permissions[feature] ? permissions[feature].includes(tier) : true;
}

export function applyTierTheme(tier) {
  const body = document.body;
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

export function canEscalatePost(tier) {
  return canAccessFeature(tier, 'escalate_post');
}

// FIXED & IMPROVED escalatePost
export async function escalatePost(postId) {
  if (!auth.currentUser) {
    showToast("Please sign in to escalate", "error");
    return;
  }

  const tier = await getCurrentUserTier();
  if (!canEscalatePost(tier)) {
    showToast("You need to be Verified Citizen or higher to escalate", "error");
    return;
  }

  try {
    showToast("🔬 Generating Forensic Proof...", "info");

    // Fetch current post data first
    const postRef = doc(db, "testimonies", postId);
    const postSnap = await getDoc(postRef);  // Need to import getDoc if not already
    if (!postSnap.exists()) {
      showToast("Post not found", "error");
      return;
    }
    const postData = postSnap.data();

    // Generate proof
    const proof = await generateRigorousProof({
      content: postData.content,
      mediaUrl: postData.imageUrl || postData.audioUrl
    });

    // Update with proof
    await updateDoc(postRef, {
      status: "verified",
      proof: proof,
      escalatedAt: new Date().toISOString(),
      escalatedBy: auth.currentUser.uid
    });

    showToast("✅ Post escalated to True Witness with forensic proof!", "success");
    
    // Optional: Refresh feed
    if (typeof window.loadFeed === 'function') {
      setTimeout(() => window.loadFeed('citizen-talk'), 800);
    }

  } catch (err) {
    console.error("Escalation failed:", err);
    showToast("Failed to escalate post: " + (err.message || ""), "error");
  }
}

export function updateTierBadge() {
  const badge = document.getElementById('tier-badge');
  if (!badge) return;

  getCurrentUserTier().then(tier => {
    badge.classList.remove('hidden');
    if (tier === TIERS.TRUE_WITNESS) {
      badge.textContent = '🔬';
      badge.style.backgroundColor = '#eab308';
    } else if (tier === TIERS.TRUST_CIRCLE) {
      badge.textContent = '✓';
      badge.style.backgroundColor = '#34d399';
    } else {
      badge.classList.add('hidden');
    }
  });
}
