// js/tier.js - Advanced Tier Logic with Watchdog & Timeout Handling
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { renderTierCircle } from './ui-components.js';

export const TIERS = {
  CITIZEN: 'citizen',
  CITIZEN_CIRCLE: 'citizen_circle',
  WITNESS_CIRCLE: 'witness_circle'
};

export const WITNESS_POSITIONS = { /* your existing positions */ };

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

// Advanced Tier Advancement with Watchdog
export async function canAdvanceTier(userId, timeoutMs = 8000) {
  const timeoutPromise = new Promise((_, reject) => 
    setTimeout(() => reject(new Error("Tier check timed out")), timeoutMs)
  );

  try {
    const result = await Promise.race([
      checkTierAdvancement(userId),
      timeoutPromise
    ]);
    return result;
  } catch (error) {
    if (error.message.includes("timed out")) {
      showToast("Tier verification timed out. Please try again.", "warning");
    } else {
      console.error(error);
      showToast("Tier check failed", "error");
    }
    return { canAdvance: false, reason: "System timeout or error" };
  }
}

async function checkTierAdvancement(userId) {
  const snap = await getDoc(doc(db, "users", userId));
  const user = snap.data() || {};

  // 1. Identity
  if (!user.hasVerifiedPhone && !user.zkVerified) {
    return { canAdvance: false, reason: "Phone or ZK verification required" };
  }

  // 2. Reliability
  const reliability = calculateReliability(user.testimonyHistory || []);
  if (reliability < 0.75) {
    return { canAdvance: false, reason: "Reliability score too low" };
  }

  // 3. Peer Diversity
  if ((user.uniqueValidators || []).length < 5) {
    return { canAdvance: false, reason: "Not enough diverse peer validations" };
  }

  // 4. Clean Record
  if ((user.fraudFlagCount || 0) > 0) {
    return { canAdvance: false, reason: "Clean forensic record required" };
  }

  // 5. Gold → Steward with Watchdog Approval
  if (user.reputation >= 80) {
    const watchdogApproved = await checkWatchdogApproval(userId);
    if (!watchdogApproved) {
      return { canAdvance: false, reason: "Gold tier reached. Awaiting Watchdog review." };
    }
    await grantStewardRole(userId);
    return { canAdvance: true, newRole: "steward" };
  }

  return { canAdvance: true, reason: "All criteria passed" };
}

function calculateReliability(history) {
  if (history.length === 0) return 0.5;
  return history.reduce((sum, t) => sum + (t.validationScore || 0.5), 0) / history.length;
}

async function checkWatchdogApproval(userId) {
  // TODO: Query steward review collection or DAO vote
  return true; // Placeholder - replace with real logic
}

async function grantStewardRole(userId) {
  await updateDoc(doc(db, "users", userId), {
    isSteward: true,
    stewardGrantedAt: serverTimestamp(),
    role: "steward"
  });
  showToast("🎖️ Promoted to Steward (under community oversight)", "success");
}

// Badge Update
export async function updateTierBadge() {
  const container = document.getElementById('profile-tier-badge');
  if (!container) return;
  // Call your radial render function
  container.innerHTML = renderTierCircle(await getCurrentWitnessPosition() || await getCurrentUserTier());
}
