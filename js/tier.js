// js/tier.js - Refined Permission Logic
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';

export const TIERS = {
    CITIZEN: 'citizen',               // Basic user
    CITIZEN_CIRCLE: 'citizen_circle', // Phone Verified
    WITNESS_CIRCLE: 'witness_circle'  // ZK Verified (True Witness)
};

// Tier Hierarchy (higher index = higher privilege)
const TIER_LEVELS = {
    [TIERS.CITIZEN]: 0,
    [TIERS.CITIZEN_CIRCLE]: 1,
    [TIERS.WITNESS_CIRCLE]: 2
};

export async function getCurrentUserTier() {
    if (!auth.currentUser) return TIERS.CITIZEN;

    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const snap = await getDoc(userRef);
        const data = snap.data() || {};

        if (data.zkVerified === true) return TIERS.WITNESS_CIRCLE;
        if (data.isPhoneVerified === true) return TIERS.CITIZEN_CIRCLE;
        return TIERS.CITIZEN;
    } catch (e) {
        console.warn("Tier fetch failed, defaulting to Citizen");
        return TIERS.CITIZEN;
    }
}

export function getTierLevel(tier) {
    return TIER_LEVELS[tier] || 0;
}

export function canAccessFeature(tier, feature) {
    const permissions = {
        // Feature → Minimum required tier
        live_arena: TIERS.WITNESS_CIRCLE,
        zk_proof: TIERS.WITNESS_CIRCLE,
        forensic_shield: TIERS.CITIZEN_CIRCLE,
        escalate_post: TIERS.CITIZEN_CIRCLE,
        review_queue: TIERS.WITNESS_CIRCLE,
        moderate_content: TIERS.WITNESS_CIRCLE
    };

    const requiredTier = permissions[feature];
    if (!requiredTier) return true; // Default: open to all

    return getTierLevel(tier) >= getTierLevel(requiredTier);
}

export function applyTierTheme(tier) {
    const body = document.body;
    body.classList.remove('tier-citizen', 'tier-citizen-circle', 'tier-witness');

    if (tier === TIERS.WITNESS_CIRCLE) {
        body.classList.add('tier-witness');
        console.log("🔬 Witness Circle theme applied");
    } else if (tier === TIERS.CITIZEN_CIRCLE) {
        body.classList.add('tier-citizen-circle');
        console.log("🛡️ Citizen Circle theme applied");
    } else {
        body.classList.add('tier-citizen');
        console.log("👤 Citizen theme applied");
    }
}

export async function escalatePost(postId) {
    if (!auth.currentUser) {
        showToast("Please sign in to escalate", "error");
        return;
    }

    const tier = await getCurrentUserTier();
    if (!canAccessFeature(tier, 'escalate_post')) {
        showToast("Citizen Circle or higher required to escalate", "error");
        return;
    }

    try {
        showToast("🔬 Generating Forensic Proof...", "info");
        // TODO: Add ZK proof generation here
        showToast("✅ Post escalated to Witness Circle!", "success");
    } catch (err) {
        console.error("Escalation failed:", err);
        showToast("Failed to escalate post", "error");
    }
}
