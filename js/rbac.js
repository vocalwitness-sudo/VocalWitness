// js/rbac.js - Advanced Role-Based Access Control
import { getCurrentUserTier, TIERS } from './tier.js';
import { showToast } from './utils.js';

export const ROLES = {
    CITIZEN: TIERS.CITIZEN,
    CITIZEN_CIRCLE: TIERS.CITIZEN_CIRCLE,
    WITNESS_CIRCLE: TIERS.WITNESS_CIRCLE,
    STEWARD: 'steward' // Earned through contribution
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

export async function canAccess(feature) {
    const tier = await getCurrentUserTier();
    const required = FEATURE_PERMISSIONS[feature];
    if (!required) return true;

    const tierLevels = {
        [ROLES.CITIZEN]: 0,
        [ROLES.CITIZEN_CIRCLE]: 1,
        [ROLES.WITNESS_CIRCLE]: 2,
        [ROLES.STEWARD]: 3
    };

    return tierLevels[tier] >= tierLevels[required];
}

// Dynamic UI Helper
export async function showIfCanAccess(feature, elementId) {
    const hasAccess = await canAccess(feature);
    const el = document.getElementById(elementId);
    if (el) el.style.display = hasAccess ? 'block' : 'none';
}

// Stewardship Logic (Earned Role)
export async function checkForStewardPromotion(userData) {
    const activityScore = (userData.testimoniesCount || 0) * 2 +
                         (userData.successfulEscalations || 0) * 5 +
                         (userData.communityEndorsements || 0) * 3;

    if (activityScore > 500 && userData.tier !== ROLES.STEWARD) {
        // Promote to Steward
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            tier: ROLES.STEWARD,
            promotedAt: new Date().toISOString()
        });
        showToast("🌟 You have been promoted to Square Steward!", "success");
        return true;
    }
    return false;
}
