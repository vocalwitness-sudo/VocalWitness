// js/rbac.js - Advanced Role-Based Access Control
import { getCurrentUserTier, TIERS } from './tier.js';
import { showToast } from './utils.js';
import { auth } from './firebase-config.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js';

export const ROLES = {
    CITIZEN: TIERS.CITIZEN,
    CITIZEN_CIRCLE: TIERS.CITIZEN_CIRCLE,
    WITNESS_CIRCLE: TIERS.WITNESS_CIRCLE,
    STEWARD: 'steward' // Earned through platform contributions
};

// Feature → Minimum required role
const FEATURE_PERMISSIONS = {
    live_arena: ROLES.WITNESS_CIRCLE,
    zk_proof: ROLES.WITNESS_CIRCLE,
    forensic_shield: ROLES.CITIZEN_CIRCLE,
    escalate_post: ROLES.CITIZEN_CIRCLE,
    review_queue: ROLES.WITNESS_CIRCLE,
    moderate_content: ROLES.STEWARD,
    create_group: ROLES.CITIZEN_CIRCLE,
    pin_post: ROLES.STEWARD,
    delete_post: ROLES.STEWARD
};

const TIER_LEVELS = {
    [ROLES.CITIZEN]: 0,
    [ROLES.CITIZEN_CIRCLE]: 1,
    [ROLES.WITNESS_CIRCLE]: 2,
    [ROLES.STEWARD]: 3
};

/**
 * Checks if the current user has permission to access a specific feature.
 */
export async function canAccess(feature) {
    const required = FEATURE_PERMISSIONS[feature];
    if (!required) return true;

    const userTier = await getCurrentUserTier();
    const userLevel = TIER_LEVELS[userTier] ?? 0;
    const requiredLevel = TIER_LEVELS[required] ?? 0;

    return userLevel >= requiredLevel;
}

/**
 * Dynamic UI Helper to toggle element visibility
 */
export async function showIfCanAccess(feature, elementId) {
    const hasAccess = await canAccess(feature);
    const el = document.getElementById(elementId);
    if (el) {
        el.style.display = hasAccess ? 'block' : 'none';
        if (!hasAccess) el.setAttribute('aria-hidden', 'true');
    }
}

/**
 * Evaluates activity score and requests backend promotion via Cloud Function
 */
export async function checkForStewardPromotion(userData) {
    if (!auth.currentUser || !userData) return false;

    const activityScore = ((userData.testimoniesCount || 0) * 2) +
                          ((userData.successfulEscalations || 0) * 5) +
                          ((userData.communityEndorsements || 0) * 3);

    // Only attempt promotion if threshold is met and user isn't already a Steward
    if (activityScore > 500 && userData.tier !== ROLES.STEWARD) {
        try {
            const functions = getFunctions();
            const promoteUser = httpsCallable(functions, 'promoteToSteward');
            
            const result = await promoteUser();

            if (result.data?.success) {
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
