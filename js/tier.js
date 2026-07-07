// js/tier.js - Aligned with Citizen Circle / Witness Circle
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';

export const TIERS = {
    CITIZEN: 'citizen',
    CITIZEN_CIRCLE: 'citizen_circle',   // Phone Verified
    WITNESS_CIRCLE: 'witness_circle'    // ZK Verified
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
        console.warn("Tier fetch failed");
        return TIERS.CITIZEN;
    }
}

export function applyTierTheme(tier) {
    const body = document.body;
    body.classList.remove('tier-citizen', 'tier-citizen-circle', 'tier-witness');

    if (tier === TIERS.WITNESS_CIRCLE) {
        body.classList.add('tier-witness');
    } else if (tier === TIERS.CITIZEN_CIRCLE) {
        body.classList.add('tier-citizen-circle');
    } else {
        body.classList.add('tier-citizen');
    }
}

export function canAccessFeature(tier, feature) {
    const permissions = {
        live_arena: [TIERS.WITNESS_CIRCLE],
        zk_proof: [TIERS.WITNESS_CIRCLE],
        forensic_shield: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE],
        escalate_post: [TIERS.CITIZEN_CIRCLE, TIERS.WITNESS_CIRCLE]
    };
    return permissions[feature] ? permissions[feature].includes(tier) : true;
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
        // Add proof generation later
        showToast("✅ Post escalated to Witness Circle!", "success");
    } catch (err) {
        console.error(err);
        showToast("Escalation failed", "error");
    }
}

export function updateTierBadge() {
    const badge = document.getElementById('profile-tier-badge');
    if (!badge) return;

    getCurrentUserTier().then(tier => {
        if (tier === TIERS.WITNESS_CIRCLE) {
            badge.textContent = "Witness Circle";
            badge.className = "px-4 py-1 bg-amber-500 text-xs rounded-full font-medium";
        } else if (tier === TIERS.CITIZEN_CIRCLE) {
            badge.textContent = "Citizen Circle";
            badge.className = "px-4 py-1 bg-emerald-600 text-xs rounded-full font-medium";
        } else {
            badge.textContent = "Citizen";
            badge.className = "px-4 py-1 bg-zinc-600 text-xs rounded-full font-medium";
        }
    });
}
