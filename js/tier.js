// js/tier.js - Enhanced Tier, Progression & Governance System
// Integrated with ZK Paid Features, Fixed Duplicate TIERS, and Cached Firebase Access

import { 
  doc, 
  getDoc, 
  collection, 
  query, 
  orderBy, 
  limit, 
  getDocs 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';

// ====================== TIER DEFINITIONS ======================
export const TIERS = {
  CITIZEN: 'citizen',
  CITIZEN_CIRCLE: 'citizen_circle',     // Phone Verified
  WITNESS_CIRCLE: 'witness_circle'      // ZK Verified
};

// Detailed Tier Metadata for Application Logic & Upload Limits
export const TIER_METADATA = {
  [TIERS.CITIZEN]: {
    id: 1,
    name: 'Citizen (Email)',
    badge: '🔒 Citizen',
    maxUploadMB: 15,
    requiresPhone: false,
    requiresZK: false,
    allowedFeeds: ['citizen-talk'],
    canVoteGovernance: false,
    canValidate: false,
  },
  [TIERS.CITIZEN_CIRCLE]: {
    id: 2,
    name: 'Verified Citizen (Phone)',
    badge: '🛡️ Field Witness',
    maxUploadMB: 100,
    requiresPhone: true,
    requiresZK: false,
    allowedFeeds: ['citizen-talk', 'citizen-circle'],
    canVoteGovernance: true,
    canValidate: false,
  },
  [TIERS.WITNESS_CIRCLE]: {
    id: 3,
    name: 'True Witness (ZK-Verified)',
    badge: '⚖️ Witness Voice',
    maxUploadMB: 500,
    requiresPhone: true,
    requiresZK: true,
    allowedFeeds: ['citizen-talk', 'citizen-circle', 'witness-voice', 'witness-circle'],
    canVoteGovernance: true,
    canValidate: true,
  }
};

// Optional Paid Add-ons for ZK Level
export const ZK_PAID_SERVICES = {
  ARWEAVE_PERMASTORAGE: {
    id: 'arweave_pin',
    name: 'Permanent IPFS / Arweave Storage',
    description: 'Pin high-res video permanently on decentralized storage so it can never be taken down.',
    baseCostUSD: 1.50
  },
  PRIORITY_ZK_PROOF: {
    id: 'priority_zk',
    name: 'Instant ZK Worker Queue',
    description: 'Bypass local browser generation and use dedicated cloud ZK workers for faster proofing.',
    baseCostUSD: 0.50
  },
  LEGAL_DISPATCH_PACK: {
    id: 'legal_dispatch',
    name: 'NGO & Legal Escalation Dispatch',
    description: 'Automatically transmit hash-verified evidence bundle to partner civil rights attorneys.',
    baseCostUSD: 2.00
  },
  WITNESS_BOOST: {
    id: 'witness_boost',
    name: 'Witness Voice Arena Boost',
    description: 'Pin testimony to top of Witness Voice feed for 48 hours to increase corroborations.',
    baseCostUSD: 3.00
  }
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

const ORDERED_WITNESS_LEVELS = Object.values(WITNESS_LEVELS).sort((a, b) => b.minRep - a.minRep);

export const ROLES = {
  USER: 'user',
  STEWARD: 'steward',
  ADMIN: 'admin'
};

export const PROFILE_MODES = {
  ANONYMOUS: 'ANONYMOUS',
  BOLD_WITNESS: 'BOLD_WITNESS'
};

// ====================== CACHING & AUTH LISTENER ======================
let cachedProfile = null;
let cachedUid = null;
let cacheTimestamp = 0;
let fetchPromise = null;
const CACHE_TTL = 30000; // 30 Seconds

// Invalidate cache immediately when user auth state changes
onAuthStateChanged(auth, (user) => {
  if (!user || user.uid !== cachedUid) {
    clearProfileCache();
    if (user) cachedUid = user.uid;
  }
});

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
    clearProfileCache();
    return null;
  }

  const currentUid = auth.currentUser.uid;
  const now = Date.now();

  if (!forceRefresh && cachedProfile && cachedUid === currentUid && (now - cacheTimestamp < CACHE_TTL)) {
    return cachedProfile;
  }

  if (fetchPromise && !forceRefresh) {
    return await fetchPromise;
  }

  fetchPromise = (async () => {
    try {
      if (!auth.currentUser) return null;
      const userRef = doc(db, "users", auth.currentUser.uid);
      const snap = await getDoc(userRef);
      cachedProfile = snap.exists() ? snap.data() : {};
      cachedUid = auth.currentUser.uid;
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
  cachedUid = null;
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

  if (data.zkVerified === true || data.tier === TIERS.WITNESS_CIRCLE) {
    return TIERS.WITNESS_CIRCLE;
  }

  if (
    data.isPhoneVerified === true ||
    data.hasVerifiedPhone === true ||
    data.tier === TIERS.CITIZEN_CIRCLE
  ) {
    return TIERS.CITIZEN_CIRCLE;
  }

  return TIERS.CITIZEN;
}

/**
 * Get current Witness Level (only for WITNESS_CIRCLE users)
 */
export async function getCurrentWitnessLevel() {
  const tier = await getCurrentUserTier();
  if (tier !== TIERS.WITNESS_CIRCLE) return null;

  const data = await getUserProfile();
  const rep = Math.max(0, data?.reputation || 0);

  for (const level of ORDERED_WITNESS_LEVELS) {
    if (rep >= level.minRep) return level;
  }
  return WITNESS_LEVELS.VERIFIED;
}

/**
 * Check if a user can advance to higher tiers
 */
export async function canAdvanceTier(uid, timeoutMs = 10000) {
  if (!uid) {
    return { canAdvance: false, reason: "User is not authenticated" };
  }

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Network timeout while fetching user profile")), timeoutMs)
    );

    const data = await Promise.race([getUserProfile(true), timeoutPromise]);

    if (!data) {
      return { canAdvance: false, reason: "User profile not found" };
    }

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

export async function hasStewardAccess() {
  const level = await getCurrentWitnessLevel();
  if (!level) return false;
  return level.level >= WITNESS_LEVELS.STEWARD.level;
}

export async function getUserVotingWeight() {
  try {
    const tier = await getCurrentUserTier();
    if (tier === TIERS.CITIZEN) return 1;

    const data = await getUserProfile();
    const rep = Math.max(0, data?.reputation || 30);

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
 * Apply visual theme based on tier safely
 */
export async function applyTierTheme() {
  if (typeof document === 'undefined' || !document.body) return;

  document.body.classList.remove(
    'theme-citizen', 'theme-citizen-circle', 'theme-witness-circle',
    'tier-citizen', 'tier-citizen-circle', 'tier-witness'
  );

  const tier = await getCurrentUserTier();
  const witnessLevel = await getCurrentWitnessLevel();

  if (tier === TIERS.WITNESS_CIRCLE) {
    document.body.classList.add('theme-witness-circle', 'tier-witness');
    if (witnessLevel) {
      document.body.style.setProperty('--witness-primary-color', witnessLevel.color);
    }
  } else if (tier === TIERS.CITIZEN_CIRCLE) {
    document.body.classList.add('theme-citizen-circle', 'tier-citizen-circle');
  } else {
    document.body.classList.add('theme-citizen', 'tier-citizen');
  }
}

/**
 * Update profile badge with current level
 */
export async function updateTierBadge() {
  const badge = document.getElementById('user-tier-badge') || 
                document.getElementById('tier-badge') || 
                document.getElementById('profile-tier-badge');
  if (!badge) return;

  const tier = await getCurrentUserTier();
  const level = await getCurrentWitnessLevel();

  if (level) {
    badge.innerHTML = `<span>${level.emblem}</span> <span>${escapeHTML(level.name)}</span>`;
    badge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold shadow-sm text-white transition-all duration-200";
    badge.style.backgroundColor = level.color;
  } else if (tier === TIERS.CITIZEN_CIRCLE) {
    badge.innerHTML = '🛡️ Citizen Circle';
    badge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    badge.style.backgroundColor = '';
  } else {
    badge.innerHTML = '👤 Citizen';
    badge.className = "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20";
    badge.style.backgroundColor = '';
  }
  badge.classList.remove('hidden');
}

/**
 * Force refresh of tier system and UI
 */
export function refreshTierAndUI() {
  clearProfileCache();
  applyTierTheme();
  updateTierBadge();
  loadWeeklyLeaderboard();
  console.log("✅ Tier system & Governance UI refreshed");
}

// ====================== WEEKLY LEADERBOARD ======================

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
 * Gate restricted actions – automatically opens phone verification if needed
 */
export async function requireCitizenCirclePermission(actionCallback) {
  const userTier = await getCurrentUserTier();

  if (userTier === TIERS.CITIZEN) {
    showToast("Phone verification required to unlock this feature.", "info");

    const modal = document.getElementById('phoneVerificationModal') || 
                  document.getElementById('phone-upgrade-modal') || 
                  document.getElementById('verificationModal');

    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    } else if (typeof window.startPhoneVerification === 'function') {
      window.startPhoneVerification();
    }

    return false;
  }

  if (typeof actionCallback === 'function') {
    actionCallback();
  }
  return true;
}

// Setup profile modal listeners
function setupProfileModalListeners() {
  const editBtn = document.getElementById('editProfileBtn');
  if (editBtn) {
    editBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const editModal = document.getElementById('editProfileModal');
      if (editModal) {
        editModal.style.display = 'flex';
        editModal.classList.remove('hidden');
      }
    });
  }

  const settingsBtn = document.getElementById('settingsBtn') || document.getElementById('securitySettingsBtn');
  if (settingsBtn) {
    settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const settingsModal = document.getElementById('settingsModal') || document.getElementById('securityModal');
      if (settingsModal) {
        settingsModal.style.display = 'flex';
        settingsModal.classList.remove('hidden');
      }
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', setupProfileModalListeners);
} else {
  setupProfileModalListeners();
}

/**
 * Helper to fetch complete user tier and level data.
 */
export async function getUserTierData(uid = null) {
  const profile = await getUserProfile();
  const currentTier = await getCurrentUserTier();
  const witnessLevel = await getCurrentWitnessLevel();
  const metadata = TIER_METADATA[currentTier] || TIER_METADATA[TIERS.CITIZEN];

  return {
    tier: currentTier,
    level: witnessLevel,
    metadata: metadata,
    reputation: profile?.reputation || 0,
    weeklyPoints: profile?.weeklyPoints || 0,
    isPhoneVerified: !!(profile?.isPhoneVerified || profile?.hasVerifiedPhone),
    isZkVerified: !!(profile?.zkVerified || currentTier === TIERS.WITNESS_CIRCLE),
    badge: witnessLevel ? `${witnessLevel.emblem} ${witnessLevel.name}` : metadata.badge,
    maxUploadMB: metadata.maxUploadMB,
    canVoteGovernance: metadata.canVoteGovernance,
    canValidate: metadata.canValidate
  };
}

/**
 * Can the current user corroborate a report?
 * Requirement: phone-verified or higher (CITIZEN_CIRCLE / WITNESS_CIRCLE)
 */
export async function canCorroborate(user = null) {
  const u = user || auth.currentUser;
  if (!u) return false;

  const tier = await getCurrentUserTier();
  return tier === TIERS.CITIZEN_CIRCLE || tier === TIERS.WITNESS_CIRCLE;
}

/**
 * Weight used for Corroboration Score
 * CITIZEN_CIRCLE = 2, WITNESS_CIRCLE = 3 (or higher based on reputation)
 */
export async function getUserTierWeight(user = null) {
  const u = user || auth.currentUser;
  if (!u) return 1;

  const tier = await getCurrentUserTier();

  if (tier === TIERS.WITNESS_CIRCLE) {
    // Optional: scale a bit with reputation for Witness Circle
    const data = await getUserProfile();
    const rep = Math.max(0, data?.reputation || 0);
    return Math.max(3, Math.min(5, Math.floor(rep / 100) + 3)); // 3–5
  }

  if (tier === TIERS.CITIZEN_CIRCLE) return 2;

  return 1; // plain Citizen (should never reach here because of canCorroborate)
}

// Global exports for window context
window.refreshTierAndUI = refreshTierAndUI;
window.requireCitizenCirclePermission = requireCitizenCirclePermission;
window.getCurrentUserTier = getCurrentUserTier;
window.canAccessFeature = canAccessFeature;
window.ZK_PAID_SERVICES = ZK_PAID_SERVICES;
window.getUserTierData = getUserTierData;
window.canCorroborate = canCorroborate;
window.getUserTierWeight = getUserTierWeight;
