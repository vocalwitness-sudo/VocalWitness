// js/rbac.js - Advanced Role-Based & Attribute-Based Access Control (RBAC/ABAC)
import { getCurrentUserTier, TIERS } from './tier.js';
import { showToast } from './utils.js';
import { auth } from './firebase-config.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js';

/**
 * Platform Roles
 */
export const ROLES = {
  CITIZEN: TIERS.CITIZEN,
  CITIZEN_CIRCLE: TIERS.CITIZEN_CIRCLE,
  WITNESS_CIRCLE: TIERS.WITNESS_CIRCLE,
  STEWARD: 'steward'
};

/**
 * Granular Capabilities Matrix
 */
export const PERMISSIONS = {
  // Citizen Capabilities
  READ_FEEDS: 'read_feeds',
  POST_CITIZEN_TALK: 'post_citizen_talk',
  COMMENT_AND_REACT: 'comment_and_react',
  UPVOTE_DOWNVOTE: 'upvote_downvote',
  
  // Citizen Circle Capabilities (Reputation-based)
  FORENSIC_SHIELD: 'forensic_shield',
  ESCALATE_POST: 'escalate_post',
  CREATE_GROUP: 'create_group',
  
  // Witness Circle Capabilities (ZK / Verification-based)
  POST_WITNESS_VOICE: 'post_witness_voice',
  GENERATE_ZK_PROOF: 'generate_zk_proof',
  LIVE_ARENA_ACCESS: 'live_arena_access',
  GATE_DOOR_ACCESS: 'gate_door_access',
  REVIEW_QUEUE: 'review_queue',

  // Steward Capabilities (Governance / Moderation)
  MODERATE_CONTENT: 'moderate_content',
  PIN_POST: 'pin_post',
  DELETE_POST: 'delete_post'
};

/**
 * Role-to-Permission Mapping Matrix
 * Supports non-linear capabilities (e.g. Witness Circle vs Citizen Circle)
 */
const ROLE_PERMISSIONS_MATRIX = {
  [ROLES.CITIZEN]: [
    PERMISSIONS.READ_FEEDS,
    PERMISSIONS.POST_CITIZEN_TALK,
    PERMISSIONS.COMMENT_AND_REACT,
    PERMISSIONS.UPVOTE_DOWNVOTE
  ],
  [ROLES.CITIZEN_CIRCLE]: [
    PERMISSIONS.READ_FEEDS,
    PERMISSIONS.POST_CITIZEN_TALK,
    PERMISSIONS.COMMENT_AND_REACT,
    PERMISSIONS.UPVOTE_DOWNVOTE,
    PERMISSIONS.FORENSIC_SHIELD,
    PERMISSIONS.ESCALATE_POST,
    PERMISSIONS.CREATE_GROUP
  ],
  [ROLES.WITNESS_CIRCLE]: [
    PERMISSIONS.READ_FEEDS,
    PERMISSIONS.POST_CITIZEN_TALK,
    PERMISSIONS.COMMENT_AND_REACT,
    PERMISSIONS.UPVOTE_DOWNVOTE,
    PERMISSIONS.POST_WITNESS_VOICE,
    PERMISSIONS.GENERATE_ZK_PROOF,
    PERMISSIONS.LIVE_ARENA_ACCESS,
    PERMISSIONS.GATE_DOOR_ACCESS,
    PERMISSIONS.REVIEW_QUEUE
  ],
  [ROLES.STEWARD]: [
    // Stewards inherit all capabilities across the platform
    ...Object.values(PERMISSIONS)
  ]
};

// Feature mapping for backwards compatibility and high-level checks
const FEATURE_MAP = {
  live_arena: PERMISSIONS.LIVE_ARENA_ACCESS,
  zk_proof: PERMISSIONS.GENERATE_ZK_PROOF,
  witness_voice: PERMISSIONS.POST_WITNESS_VOICE,
  citizen_talk: PERMISSIONS.POST_CITIZEN_TALK,
  forensic_shield: PERMISSIONS.FORENSIC_SHIELD,
  escalate_post: PERMISSIONS.ESCALATE_POST,
  review_queue: PERMISSIONS.REVIEW_QUEUE,
  moderate_content: PERMISSIONS.MODERATE_CONTENT,
  create_group: PERMISSIONS.CREATE_GROUP,
  pin_post: PERMISSIONS.PIN_POST,
  delete_post: PERMISSIONS.DELETE_POST
};

let cachedUserClaims = null;
let cachedUserTier = null;

/**
 * Pre-warms and caches user permissions from Auth Token or Tier service.
 * Call this during app init or auth state changes.
 */
export async function initRBAC(forceRefresh = false) {
  if (!auth.currentUser) {
    cachedUserClaims = null;
    cachedUserTier = ROLES.CITIZEN;
    return cachedUserTier;
  }

  try {
    const tokenResult = await auth.currentUser.getIdTokenResult(forceRefresh);
    cachedUserClaims = tokenResult.claims;
    cachedUserTier = tokenResult.claims?.tier || (await getCurrentUserTier());
  } catch (err) {
    console.warn('Failed to pre-warm RBAC token claims:', err);
    cachedUserTier = await getCurrentUserTier();
  }

  return cachedUserTier;
}

/**
 * Synchronous check for cached user role (Zero jank UI helper)
 */
export function getCachedRole() {
  return cachedUserTier || ROLES.CITIZEN;
}

/**
 * Checks if the current user has permission to execute a given feature/permission.
 * @param {string} permissionOrFeature - Key from PERMISSIONS or FEATURE_MAP
 * @returns {Promise<boolean>}
 */
export async function canAccess(permissionOrFeature) {
  const permission = FEATURE_MAP[permissionOrFeature] || permissionOrFeature;
  const userTier = cachedUserTier || (await getCurrentUserTier());

  const allowedPermissions = ROLE_PERMISSIONS_MATRIX[userTier] || ROLE_PERMISSIONS_MATRIX[ROLES.CITIZEN];
  return allowedPermissions.includes(permission);
}

/**
 * Throws an explicit authorization error if permission is missing.
 * Use before triggering sensitive client-side operations (e.g., ZK computation).
 */
export async function assertPermission(permissionOrFeature, actionLabel = 'perform this action') {
  const allowed = await canAccess(permissionOrFeature);
  if (!allowed) {
    const msg = `Access Restricted: Your current account tier (${cachedUserTier || 'Citizen'}) cannot ${actionLabel}.`;
    if (typeof showToast === 'function') showToast(msg, 'warning');
    throw new Error(msg);
  }
  return true;
}

/**
 * Checks if a Witness Circle member can restrict door access against a target user.
 * @param {string} targetUserTier - The tier of the user attempting to enter.
 * @returns {boolean} True if access is blocked.
 */
export function isDoorGatedForTier(targetUserTier) {
  // Witness Circle members can close the door to Citizen tier users
  return targetUserTier === ROLES.CITIZEN;
}

/**
 * Dynamic UI Helper to toggle element visibility safely
 */
export async function showIfCanAccess(permissionOrFeature, elementIdOrSelector) {
  const hasAccess = await canAccess(permissionOrFeature);
  
  let elements = [];
  if (typeof elementIdOrSelector === 'string') {
    const byId = document.getElementById(elementIdOrSelector);
    elements = byId ? [byId] : Array.from(document.querySelectorAll(elementIdOrSelector));
  } else if (elementIdOrSelector instanceof HTMLElement) {
    elements = [elementIdOrSelector];
  }

  elements.forEach(el => {
    if (el) {
      el.style.display = hasAccess ? '' : 'none';
      if (!hasAccess) {
        el.setAttribute('aria-hidden', 'true');
        el.classList.add('hidden');
      } else {
        el.removeAttribute('aria-hidden');
        el.classList.remove('hidden');
      }
    }
  });

  return hasAccess;
}

/**
 * Evaluates activity score and requests backend promotion via Cloud Function
 */
export async function checkForStewardPromotion(userData) {
  if (!auth.currentUser || !userData) return false;

  // Reputation Formula: Testimonies + Escalations + Community Endorsements
  const activityScore = ((userData.testimoniesCount || 0) * 2) +
                        ((userData.successfulEscalations || 0) * 5) +
                        ((userData.communityEndorsements || 0) * 3);

  if (activityScore > 500 && userData.tier !== ROLES.STEWARD) {
    try {
      const functions = getFunctions();
      const promoteUser = httpsCallable(functions, 'promoteToSteward');
      
      const result = await promoteUser();

      if (result.data?.success) {
        // Invalidate local cache to force claim refresh
        await initRBAC(true);

        if (typeof showToast === 'function') {
          showToast("🌟 You have been promoted to Square Steward!", "success");
        }
        return true;
      }
    } catch (error) {
      console.error("Cloud Function steward promotion failed:", error);
      if (typeof showToast === 'function') {
        showToast("Failed to process Steward promotion. Please try again later.", "error");
      }
      return false;
    }
  }
  return false;
}

// Global window bindings for legacy script access
window.initRBAC = initRBAC;
window.canAccess = canAccess;
window.getCachedRole = getCachedRole;
window.showIfCanAccess = showIfCanAccess;
