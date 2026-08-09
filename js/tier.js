// js/tier.js - Enhanced Tier, Progression & Governance System (Optimized & Cached)
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs, 
  serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';

export const TIERS = {
  CITIZEN: 'citizen',
  CITIZEN_CIRCLE: 'citizen_circle',     // Phone Verified
  WITNESS_CIRCLE: 'witness_circle'      // ZK Verified
};

// Witness Circle Progression Levels
export const WITNESS_LEVELS = {
  VERIFIED: {
    name: "Verified Witness",
    level: 1,
    emblem: "🔵",
    color: "#3b82f6",
    minRep: 30,
    benefits: ["Forensic Shield", "Basic Verification Badge"]
  },
  SILVER: {
    name: "Silver Witness",
    level: 2,
    emblem: "🥈",
    color: "#94a3b8",
    minRep: 80,
    benefits: ["Priority in Live Arena", "Create Groups", "Post Boost"]
  },
  GOLD: {
    name: "Gold Witness",
    level: 3,
    emblem: "🥇",
    color: "#eab308",
    minRep: 150,
    benefits: ["Advanced ZK Tools", "Content Promotion", "Higher Visibility"]
  },
  STEWARD: {
    name: "Steward",
    level: 4,
    emblem: "🟡",
    color: "#f59e0b",
    minRep: 300,
    benefits: ["Moderation Tools", "DAO Voting Power", "Escalate Posts", "Steward Apartment Access"]
  },
  ELDER_STEWARD: {
    name: "Elder Steward",
    level: 5,
    emblem: "🔴",
    color: "#a855f7",
    minRep: 600,
    benefits: ["Review Queue Access", "Special Badge", "Platform Influence", "Final Dispute Arbitration"]
  },
  ARCHITECT: {
    name: "Architect",
    level: 6,
    emblem: "💎",
    color: "#ec4899",
    minRep: 1000,
    benefits: ["Custom Features", "High Influence", "Legacy Status", "System-Wide Governance"]
  }
};

export const ROLES = {
  USER: 'user',
  STEWARD: 'steward',
  ADMIN: 'admin'
};

// ====================== CACHING MECHANISM ======================
let cachedProfile = null;
let cacheTimestamp = 0;
let fetchPromise = null;
const CACHE_TTL = 30000; // 30 Seconds cache

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function getUserProfile(forceRefresh = false) {
  if (!auth.currentUser) {
    cachedProfile = null;
    return null;
  }

  const now = Date.now();
  if (!forceRefresh && cachedProfile && (now - cacheTimestamp < CACHE_TTL)) {
    return cachedProfile;
  }

  if (fetchPromise && !forceRefresh) {
    return await fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      const userRef = doc(db, "users", auth.currentUser.uid);
      const snap = await getDoc(userRef);
      cachedProfile = snap.exists() ? snap.data() : {};
      cacheTimestamp = Date.now();
      return cachedProfile;
    } catch (e) {
      console.warn("User profile fetch failed, using fallback/cache:", e);
      return cachedProfile || {};
    } finally {
      fetchPromise = null;
    }
  })();

  return await fetchPromise;
}

export function clearProfileCache() {
  cachedProfile = null;
  cacheTimestamp = 0;
  fetchPromise = null;
}

/**
 * Get current user's main tier
 */
export async function getCurrentUserTier() {
  if (!auth.currentUser) return TIERS.CITIZEN;

  const data = await getUserProfile();
  if (!data) return TIERS.CITIZEN;

  if (data.zkVerified === true || data.tier === TIERS.WITNESS_CIRCLE) return TIERS.WITNESS_CIRCLE;
  if (data.isPhoneVerified === true || data.tier === TIERS.CITIZEN_CIRCLE) return TIERS.CITIZEN_CIRCLE;
  return TIERS.CITIZEN;
}

/**
 * Get current Witness Level (only for WITNESS_CIRCLE users)
 */
export async function getCurrentWitnessLevel() {
  const tier = await getCurrentUserTier();
  if (tier !== TIERS.WITNESS_CIRCLE) return null;

  const data = await getUserProfile();
  const rep = data?.reputation || 0;

  // Return highest level achieved
  const levels = Object.values(WITNESS_LEVELS).reverse();
  for (const level of levels) {
    if (rep >= level.minRep) return level;
  }
  return WITNESS_LEVELS.VERIFIED;
}

/**
 * Helper to check if user can advance tier
 */
// js/tier.js - Updated canAdvanceTier with internal timeout safety

/**
 * Check if a user meets the prerequisites to advance their tier.
 * @param {string} uid - User ID to check
 * @param {number} timeoutMs - Max wait time in milliseconds (default: 10000ms)
 * @returns {Promise<{canAdvance: boolean, reason?: string}>}
 */
export async function canAdvanceTier(uid, timeoutMs = 10000) {
  if (!uid) {
    return { canAdvance: false, reason: "User is not authenticated" };
  }

  try {
    // Timeout promise to catch hanging Firestore reads
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout while fetching user profile")), timeoutMs)
    );

    // Race the profile fetch against the timeout
    const data = await Promise.race([getUserProfile(), timeoutPromise]);

    if (!data) {
      return { canAdvance: false, reason: "User profile not found" };
    }

    // Example gating check: Citizen Circle (phone verified) is required before Witness Circle
    if (!data.isPhoneVerified && !data.hasVerifiedPhone) {
      return { canAdvance: false, reason: "Phone verification is required first" };
    }

    return { canAdvance: true };
  } catch (error) {
    console.error("canAdvanceTier error:", error);
    return { 
      canAdvance: false, 
      reason: error.message || "Verification check timed out or failed" 
    };
  }
}

/**
 * Check if the user has Steward-level privileges
 */
export async function hasStewardAccess() {
  const level = await getCurrentWitnessLevel();
  if (!level) return false;
  return level.level >= WITNESS_LEVELS.STEWARD.level;
}

/**
 * Calculate voting weight for DAO proposals based on reputation & tier
 */
export async function getUserVotingWeight() {
  try {
    const tier = await getCurrentUserTier();
    if (tier === TIERS.CITIZEN) return 1;

    const data = await getUserProfile();
    const rep = data?.reputation || 30;

    if (tier === TIERS.CITIZEN_CIRCLE) return 2;
    return Math.max(3, Math.floor(rep / 50));
  } catch (e) {
    return 1;
  }
}

/**
 * Check if user can access a feature
 */
export async function canAccessFeature(feature) {
  const userTier = await getCurrentUserTier();
  const userLevel = await getCurrentWitnessLevel();

  if (feature === 'review_queue' || feature === 'steward_apartment') {
    return await hasStewardAccess();
  }

  if (feature === 'post_boost') {
    return userLevel && userLevel.level >= WITNESS_LEVELS.SILVER.level;
  }

  const permissions = {
    witness_circle: [TIERS.WITNESS_CIRCLE],
    live_arena: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    forensic_shield: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    create_group: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
    escalate_post: [TIERS.WITNESS_CIRCLE],
    dao_proposal: [TIERS.WITNESS_CIRCLE]
  };

  const allowedTiers = permissions[feature];
  if (!allowedTiers) return true;

  return allowedTiers.includes(userTier);
}

/**
 * Apply visual theme based on tier
 */
export function applyTierTheme() {
  const body = document.body;
  body.classList.remove('tier-citizen', 'tier-citizen-circle', 'tier-witness');

  getCurrentUserTier().then(tier => {
    if (tier === TIERS.WITNESS_CIRCLE) body.classList.add('tier-witness');
    else if (tier === TIERS.CITIZEN_CIRCLE) body.classList.add('tier-citizen-circle');
    else body.classList.add('tier-citizen');
  });
}

/**
 * Update profile badge with current level
 */
export async function updateTierBadge() {
  const badge = document.getElementById('profile-tier-badge');
  if (!badge) return;

  const tier = await getCurrentUserTier();
  const level = await getCurrentWitnessLevel();

  if (level) {
    badge.innerHTML = `${level.emblem} ${level.name}`;
    badge.style.backgroundColor = level.color;
    badge.style.color = "#fff";
  } else if (tier === TIERS.CITIZEN_CIRCLE) {
    badge.innerHTML = '🛡️ Citizen Circle';
    badge.style.backgroundColor = '#34d399';
    badge.style.color = "#000";
  } else {
    badge.innerHTML = '👤 Citizen';
    badge.style.backgroundColor = '#6b7280';
    badge.style.color = "#fff";
  }
  badge.classList.remove('hidden');
}

export function refreshTierAndUI() {
  clearProfileCache();
  applyTierTheme();
  updateTierBadge();
  loadWeeklyLeaderboard();
  console.log("✅ Tier system & Governance UI refreshed");
}

// ====================== WEEKLY LEADERBOARD & REPUTATION EXPANSION ======================

/**
 * Fetch and render the Top 5 Ranked Witnesses for the weekly sidebar
 */
export async function loadWeeklyLeaderboard() {
  const leaderboardEl = document.getElementById('weekly-leaderboard');
  if (!leaderboardEl) return;

  try {
    const q = query(
      collection(db, "users"),
      orderBy("weeklyPoints", "desc"),
      limit(5)
    );

    const querySnapshot = await getDocs(q);
    let html = '';
    let rank = 1;

    querySnapshot.forEach((docSnap) => {
      const user = docSnap.data();
      const badgeColor = rank === 1 ? 'text-amber-400' : 'text-emerald-400';
      const name = escapeHTML(user.displayName || 'Anonymous Witness');

      html += `
        <div class="flex items-center justify-between py-2 border-b border-slate-800 text-sm">
          <div class="flex items-center gap-2">
            <span class="font-bold ${badgeColor}">#${rank}</span>
            <span class="text-slate-200 font-medium">${name}</span>
          </div>
          <span class="text-xs bg-emerald-950 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800 font-semibold">
            ${user.weeklyPoints || 0} pts
          </span>
        </div>`;
      rank++;
    });

    leaderboardEl.innerHTML = html || `<p class="text-xs text-slate-400">Points resetting for the new week...</p>`;
  } catch (err) {
    console.warn("Leaderboard fetch error:", err);
    leaderboardEl.innerHTML = `<p class="text-xs text-slate-500">Leaderboard temporarily unavailable.</p>`;
  }
}

/**
 * Enhanced recordTestimonyContribution: Awards overall Reputation AND Weekly Leaderboard Points
 */
export async function recordTestimonyContribution() {
  if (!auth.currentUser) return;

  try {
    const data = await getUserProfile(true);
    const currentRep = data?.reputation || 0;
    const currentWeeklyPoints = data?.weeklyPoints || 0;

    const userRef = doc(db, "users", auth.currentUser.uid);
    await setDoc(userRef, {
      reputation: currentRep + 15,
      weeklyPoints: currentWeeklyPoints + 15,
      lastContribution: serverTimestamp()
    }, { merge: true });

    refreshTierAndUI();
    console.log("✅ +15 Reputation and Weekly Points recorded.");
  } catch (e) {
    console.warn("Reputation update failed:", e);
  }
}

/**
 * Gate restricted actions and automatically prompt verification if required
 */
export async function requireCitizenCirclePermission(actionCallback) {
  const userTier = await getCurrentUserTier();

  if (userTier === TIERS.CITIZEN) {
    if (typeof showToast === 'function') {
      showToast("Phone verification required to unlock this feature.", "info");
    }

    const modal = document.getElementById('phoneVerificationModal') || document.getElementById('phone-upgrade-modal');
    if (modal) {
      modal.classList.remove('hidden');
    }
    return false;
  }

  if (typeof actionCallback === 'function') {
    actionCallback();
  }
  return true;
}
