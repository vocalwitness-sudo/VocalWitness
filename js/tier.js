// js/tier.js - Clean & Powerful Tier System for Two Circles
import { doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { AppState, updateAppState } from './app-state.js';

export const TIERS = {
    CITIZEN: 'citizen',
    CITIZEN_CIRCLE: 'citizen_circle',   // Phone Verified
    WITNESS_CIRCLE: 'witness_circle'    // ZK Verified
};

export async function getCurrentUserTier() {
    if (!auth.currentUser) return TIERS.CITIZEN;

    try {
        const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
        const data = userSnap.data() || {};

        if (data.zkVerified === true) return TIERS.WITNESS_CIRCLE;
        if (data.isPhoneVerified === true) return TIERS.CITIZEN_CIRCLE;
        return TIERS.CITIZEN;
    } catch (e) {
        console.warn("Tier fetch failed, defaulting to Citizen", e);
        return TIERS.CITIZEN;
    }
}

// Update AppState + UI when tier changes
export async function refreshTierAndUI() {
    const tier = await getCurrentUserTier();
    updateAppState({ userTier: tier });
    
    // Optional: Update badge if exists
    const badge = document.getElementById('profile-tier-badge');
    if (badge && window.updateTierBadge) {
        window.updateTierBadge();
    }
    
    return tier;
}

// Simple door/visibility helper
export function getUserAccessibleModes() {
    const tier = AppState.userTier;
    if (tier === TIERS.WITNESS_CIRCLE) return ['citizen', 'witness'];
    if (tier === TIERS.CITIZEN_CIRCLE) return ['citizen'];
    return ['citizen'];
}
