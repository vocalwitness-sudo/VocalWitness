// js/tier.js
export const TIERS = {
  CITIZEN: 'citizen',
  TRUST_CIRCLE: 'trust_circle',
  TRUE_WITNESS: 'true_witness'
};

export function getUserTier(userData) {
  if (!userData) return TIERS.CITIZEN;

  if (userData.zkVerified === true) return TIERS.TRUE_WITNESS;
  if (userData.isPhoneVerified === true) return TIERS.TRUST_CIRCLE;
  return TIERS.CITIZEN;
}

export function canAccessFeature(userData, feature) {
  const tier = getUserTier(userData);

  const permissions = {
    forensic_shield: [TIERS.TRUE_WITNESS],
    zk_proof: [TIERS.TRUE_WITNESS],
    witness_cycle: [TIERS.TRUE_WITNESS],
    data_export: [TIERS.TRUE_WITNESS],
    join_circle: [TIERS.TRUST_CIRCLE, TIERS.TRUE_WITNESS],
    basic_attest: [TIERS.TRUST_CIRCLE, TIERS.TRUE_WITNESS],
    high_visibility: [TIERS.TRUST_CIRCLE, TIERS.TRUE_WITNESS],
    forensic_tools: [TIERS.TRUE_WITNESS]
  };

  return permissions[feature] ? permissions[feature].includes(tier) : true;
}

export function getTierInfo(userData) {
  const tier = getUserTier(userData);
  const map = {
    [TIERS.CITIZEN]: { name: "Citizen Talk", emoji: "🗣️", color: "zinc", desc: "Open Public Square" },
    [TIERS.TRUST_CIRCLE]: { name: "Trust Circle", emoji: "🤝", color: "amber", desc: "Trusted Community" },
    [TIERS.TRUE_WITNESS]: { name: "True Witness", emoji: "🛡️", color: "emerald", desc: "Verified Lung - Forensic" }
  };
  return map[tier];
}

// Add this to js/tier.js
export function upgradeToTrustCircle(userId) {
    const userRef = doc(db, "users", userId);
    return setDoc(userRef, {
        isPhoneVerified: true,
        tier: "trust_circle",
        trustCircle: 70,
        lastUpdated: new Date().toISOString()
    }, { merge: true });
}
