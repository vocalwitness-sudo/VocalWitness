// js/reputation.js
// Balanced Reputation & Support System for VocalWitness
// Quadratic cost + Diminishing returns + Daily budget + Anti-collusion

import { db, auth } from './firebase-config.js';
import {
  doc, getDoc, updateDoc, collection, addDoc, query, where, getDocs,
  serverTimestamp, increment, Timestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { getCurrentWitnessLevel, WITNESS_LEVELS, getUserProfile } from './tier.js';
import { logSecurityAudit } from './audit.js';

/* ============================================================
   CONFIGURATION
   ============================================================ */
const SUPPORT_CONFIG = {
  // Daily support budget by Witness Level
  DAILY_BUDGET: {
    1: 5,   // Verified Witness
    2: 8,   // Silver
    3: 12,  // Gold
    4: 18,  // Steward
    5: 25,  // Elder Steward
    6: 30   // Architect
  },

  // How much reputation the receiver gets (before diminishing)
  BASE_GAIN: {
    1: 1.5,
    2: 2.5,
    3: 4,
    4: 6,
    5: 8
  },

  // Diminishing factor (higher = stronger diminishing)
  DIMINISH_FACTOR: 450,

  // Cooldown: same person can only meaningfully support the same user once every X days
  SUPPORT_COOLDOWN_DAYS: 10,

  // Minimum reputation the giver must have
  MIN_GIVER_REP: 20
};

/* ============================================================
   HELPERS
   ============================================================ */
function quadraticCost(strength) {
  return strength * strength;
}

function calculateDiminishedGain(baseGain, currentRep) {
  // Diminishing returns formula
  return baseGain * (1 / (1 + currentRep / SUPPORT_CONFIG.DIMINISH_FACTOR));
}

function getDailyBudget(level) {
  return SUPPORT_CONFIG.DAILY_BUDGET[level] || 5;
}

/* ============================================================
   MAIN: Give Support (Upvote / Shine)
   ============================================================ */
export async function giveSupport(targetUserId, strength = 1) {
  if (!auth.currentUser) {
    showToast("Sign in required to support someone", "error");
    return false;
  }

  if (strength < 1 || strength > 5) {
    showToast("Support strength must be between 1 and 5", "error");
    return false;
  }

  const giverId = auth.currentUser.uid;

  if (giverId === targetUserId) {
    showToast("You cannot support yourself", "error");
    return false;
  }

  try {
    // --- Load profiles ---
    const [giverSnap, targetSnap] = await Promise.all([
      getDoc(doc(db, "users", giverId)),
      getDoc(doc(db, "users", targetUserId))
    ]);

    if (!giverSnap.exists() || !targetSnap.exists()) {
      showToast("User not found", "error");
      return false;
    }

    const giver = giverSnap.data();
    const target = targetSnap.data();

    const giverRep = giver.reputation || giver.credibilityScore || 0;
    const targetRep = target.reputation || target.credibilityScore || 0;

    // Minimum reputation to give support
    if (giverRep < SUPPORT_CONFIG.MIN_GIVER_REP) {
      showToast(`You need at least ${SUPPORT_CONFIG.MIN_GIVER_REP} reputation to support others`, "warning");
      return false;
    }

    // --- Check Witness Level for budget ---
    const witnessLevel = await getCurrentWitnessLevel();
    const levelNum = witnessLevel?.level || 1;
    const dailyBudget = getDailyBudget(levelNum);

    // --- Check daily budget used ---
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const budgetQuery = query(
      collection(db, "support_log"),
      where("giverId", "==", giverId),
      where("createdAt", ">=", Timestamp.fromDate(todayStart))
    );
    const budgetSnap = await getDocs(budgetQuery);

    let usedToday = 0;
    budgetSnap.forEach(doc => {
      usedToday += doc.data().cost || 0;
    });

    const cost = quadraticCost(strength);
    if (usedToday + cost > dailyBudget) {
      showToast(`Daily support budget exceeded (${usedToday}/${dailyBudget}). Try again tomorrow.`, "warning");
      return false;
    }

    // --- Anti-collusion: cooldown check ---
    const cooldownDate = new Date();
    cooldownDate.setDate(cooldownDate.getDate() - SUPPORT_CONFIG.SUPPORT_COOLDOWN_DAYS);

    const cooldownQuery = query(
      collection(db, "support_log"),
      where("giverId", "==", giverId),
      where("targetId", "==", targetUserId),
      where("createdAt", ">=", Timestamp.fromDate(cooldownDate))
    );
    const cooldownSnap = await getDocs(cooldownQuery);

    if (!cooldownSnap.empty) {
      showToast(`You already supported this person recently. Wait ${SUPPORT_CONFIG.SUPPORT_COOLDOWN_DAYS} days.`, "info");
      return false;
    }

    // --- Calculate actual reputation gain (diminishing) ---
    const baseGain = SUPPORT_CONFIG.BASE_GAIN[strength] || 1.5;
    const actualGain = Math.max(0.5, calculateDiminishedGain(baseGain, targetRep));
    const roundedGain = Math.round(actualGain * 10) / 10; // 1 decimal

    // --- Write everything ---
    // 1. Log the support
    await addDoc(collection(db, "support_log"), {
      giverId,
      targetId: targetUserId,
      strength,
      cost,
      reputationGiven: roundedGain,
      giverRepAtTime: giverRep,
      targetRepAtTime: targetRep,
      createdAt: serverTimestamp()
    });

    // 2. Update target reputation
    await updateDoc(doc(db, "users", targetUserId), {
      reputation: increment(roundedGain),
      credibilityScore: increment(roundedGain),
      lastSupportedAt: serverTimestamp(),
      totalSupportsReceived: increment(1)
    });

    // 3. Small reward for the giver (encourages healthy participation)
    await updateDoc(doc(db, "users", giverId), {
      reputation: increment(0.3),
      credibilityScore: increment(0.3)
    });

    await logSecurityAudit('SUPPORT_GIVEN', targetUserId, {
      strength,
      cost,
      reputationGiven: roundedGain
    });

    showToast(`You supported this witness (+${roundedGain} REP). Cost: ${cost} points`, "success");
    return true;

  } catch (error) {
    console.error("giveSupport error:", error);
    showToast("Failed to give support", "error");
    return false;
  }
}

/* ============================================================
   OPTIONAL: Challenge / Soft Downvote (careful version)
   ============================================================ */
export async function challengeWitness(targetUserId, reason = "") {
  // You can implement later if needed.
  // For now we keep it simple and positive-focused.
  showToast("Challenge system coming soon", "info");
  return false;
}

/* ============================================================
   Utility: Get remaining daily budget
   ============================================================ */
export async function getRemainingSupportBudget() {
  if (!auth.currentUser) return 0;

  const witnessLevel = await getCurrentWitnessLevel();
  const levelNum = witnessLevel?.level || 1;
  const dailyBudget = getDailyBudget(levelNum);

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const q = query(
    collection(db, "support_log"),
    where("giverId", "==", auth.currentUser.uid),
    where("createdAt", ">=", Timestamp.fromDate(todayStart))
  );

  const snap = await getDocs(q);
  let used = 0;
  snap.forEach(d => used += d.data().cost || 0);

  return Math.max(0, dailyBudget - used);
}
