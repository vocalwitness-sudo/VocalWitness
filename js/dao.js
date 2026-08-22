// js/dao.js - Enhanced Quadratic Voting, Multi-Sig Governance & Cryptographic Trust (Batch 3)
import { db, auth } from './firebase-config.js';
import {
  collection,
  addDoc,
  getDoc,
  getDocs,
  updateDoc,
  doc,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  arrayUnion
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import {
  getCurrentUserTier,
  getUserVotingWeight,
  TIERS,
  requireCitizenCirclePermission,
  hasStewardAccess
} from './tier.js';
import { generateRigorousProof } from './zk-crypto.js';
import { logSecurityAudit } from './audit.js';
import { generateZKProofAsync } from './zk-client.js';

// Constant Thresholds
export const MINIMUM_MULTISIG_THRESHOLD = 3;

// Quadratic Voting Cost Formula
function quadraticCost(strength) {
  return strength * strength;
}

/**
 * Record Testimony Contribution (awards credibility score)
 */
export async function recordTestimonyContribution() {
  if (!auth.currentUser) return;

  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const data = snap.data();
      const currentRep = data.credibilityScore || data.reputation || 0;
      await updateDoc(userRef, {
        credibilityScore: currentRep + 15,
        reputation: currentRep + 15,
        lastContribution: serverTimestamp()
      });
      console.log("✅ +15 Reputation for testimony");
    }
  } catch (e) {
    console.warn("Reputation update failed:", e);
  }
}

/**
 * Small reputation reward for governance participation
 */
async function awardGovernanceRep(points = 5) {
  if (!auth.currentUser) return;
  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) return;

    const data = snap.data();
    const currentRep = data.credibilityScore || data.reputation || 0;

    await updateDoc(userRef, {
      credibilityScore: currentRep + points,
      reputation: currentRep + points,
      lastGovernanceAction: serverTimestamp()
    });
  } catch (e) {
    console.warn("Governance reputation update failed:", e);
  }
}

/**
 * Create DAO Proposal (Witness Circle or Admin/Moderator)
 */
export async function createDAOProposal(title, description, category = 'governance') {
  if (!auth.currentUser) return showToast("Sign in required", "error");

  try {
    const tier = await getCurrentUserTier();
    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const userData = userSnap.data() || {};

    const canCreate =
      tier === TIERS.WITNESS_CIRCLE ||
      ['admin', 'moderator', 'steward'].includes(userData.role);

    if (!canCreate) {
      return showToast("Only Witness Circle members or Stewards can create proposals", "error");
    }

    const proposalRef = await addDoc(collection(db, "dao_proposals"), {
      title: title.trim(),
      description: description.trim(),
      category,
      createdBy: auth.currentUser.uid,
      creatorDisplayName: auth.currentUser.displayName || 'Anonymous Witness',
      creatorRole: userData.role || 'citizen',
      createdAt: serverTimestamp(),
      status: "active",
      totalVotesFor: 0,
      totalVotesAgainst: 0,
      totalVotingPowerSpent: 0,
      quorum: 12,
      multiSigSignatures: [],
      voteLog: {}
    });

    await awardGovernanceRep(8);
    await logSecurityAudit('DAO_PROPOSAL_CREATED', proposalRef.id, {
      title,
      category
    });

    showToast("✅ DAO Proposal created", "success");
    return proposalRef.id;
  } catch (e) {
    console.error("Proposal creation error:", e);
    showToast("Failed to create proposal", "error");
    return null;
  }
}

/**
 * Create a Moderation Appeal proposal (community can challenge a Steward decision)
 */
export async function createModerationAppeal(postId, reason, originalDecision = 'purged') {
  if (!auth.currentUser) return showToast("Sign in required", "error");

  try {
    const title = `Appeal: ${originalDecision.toUpperCase()} decision on post ${postId.substring(0, 8)}…`;
    const description = `Community appeal against moderation decision.\n\nOriginal Decision: ${originalDecision}\nPost ID: ${postId}\n\nReason for appeal:\n${reason.trim()}`;

    const proposalId = await createDAOProposal(title, description, 'moderation_appeal');

    if (proposalId) {
      await updateDoc(doc(db, "dao_proposals", proposalId), {
        relatedPostId: postId,
        originalDecision
      });
    }

    return proposalId;
  } catch (e) {
    console.error("Moderation appeal error:", e);
    showToast("Failed to create appeal", "error");
    return null;
  }
}

/**
 * Cast Quadratic Vote (with Sybil Protection + Voting Weight)
 */
export async function castQuadraticVote(proposalId, direction, strength = 1, proofContext = {}) {
  if (!auth.currentUser) return showToast("Sign in required", "error");
  if (strength < 1 || strength > 5) return showToast("Strength must be between 1-5", "error");
  if (!['for', 'against'].includes(direction)) {
    return showToast("Invalid vote direction", "error");
  }

  const userId = auth.currentUser.uid;

  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return showToast("User profile not found", "error");

  const userData = userSnap.data();
  const userReputation = userData.credibilityScore || userData.reputation || 0;

  if (!userData.isPhoneVerified && !userData.hasVerifiedPhone && userReputation < 10) {
    if (typeof requireCitizenCirclePermission === 'function') {
      const hasPermission = await requireCitizenCirclePermission();
      if (!hasPermission) return;
    } else {
      return showToast("Account must be phone verified or have 10+ REP to vote", "error");
    }
  }

  const proposalRef = doc(db, "dao_proposals", proposalId);
  const proposalSnap = await getDoc(proposalRef);
  if (!proposalSnap.exists()) return showToast("Proposal not found", "error");

  const data = proposalSnap.data();

  if (data.status !== 'active') {
    return showToast("This proposal is no longer open for voting", "error");
  }

  const previousVote = data.voteLog?.[userId];
  if (previousVote && previousVote.direction === direction) {
    return showToast("You already voted this way. You can change direction or increase strength in a future update.", "info");
  }

  const cost = quadraticCost(strength);
  const currentSpent = previousVote?.cost || 0;

  if (currentSpent + cost > 25) {
    return showToast("Exceeded voting budget (max 25 power points)", "error");
  }

  let zkProof = null;
  try {
    zkProof = await generateRigorousProof({
      action: "dao_vote",
      proposalId,
      direction,
      strength,
      context: proofContext
    });
  } catch (e) {
    console.warn("ZK Proof generation skipped:", e);
  }

  const currentTier = await getCurrentUserTier();
  const votingWeight = await getUserVotingWeight();

  const effectiveStrength = Math.min(strength * Math.max(1, Math.floor(votingWeight / 2)), 8);

  const updateData = direction === 'for'
    ? { totalVotesFor: (data.totalVotesFor || 0) + effectiveStrength }
    : { totalVotesAgainst: (data.totalVotesAgainst || 0) + effectiveStrength };

  await updateDoc(proposalRef, {
    ...updateData,
    totalVotingPowerSpent: (data.totalVotingPowerSpent || 0) + cost,
    [`voteLog.${userId}`]: {
      direction,
      strength,
      effectiveStrength,
      cost: currentSpent + cost,
      voterTier: currentTier || 'citizen',
      voterRole: userData.role || 'citizen',
      votingWeight,
      zkProof: zkProof ? (zkProof.hash || zkProof) : null,
      timestamp: serverTimestamp()
    }
  });

  await awardGovernanceRep(3);
  await logSecurityAudit('DAO_VOTE_CAST', proposalId, {
    direction,
    strength,
    effectiveStrength
  });

  showToast(`Voted ${direction.toUpperCase()} (Cost: ${cost} • Effective strength: ${effectiveStrength})`, "success");
}

/* ==========================================================================
   BATCH 3: HIGH-STAKES MULTI-SIG & DECENTRALIZED TRUST EXTENSIONS
   ========================================================================== */

/**
 * Submit an attestation signature/proof to a high-stakes testimony or proposal multi-sig pool
 */
export async function submitMultiSigAttestation(targetId, proofData, isProposal = false) {
  if (!auth.currentUser) {
    showToast("You must be logged in to sign multi-sig attestations.", "error");
    return false;
  }

  try {
    const collectionName = isProposal ? "dao_proposals" : "testimonies";
    const targetRef = doc(db, collectionName, targetId);
    
    const attestationRecord = {
      witnessUid: auth.currentUser.uid,
      proofType: proofData.proofType || "UNKNOWN",
      publicSignalsHash: proofData.publicSignals ? proofData.publicSignals[0] : (proofData.proof?.hash || proofData.payloadHash || null),
      isFallback: !!proofData.isFallback,
      signedAt: new Date().toISOString()
    };

    await updateDoc(targetRef, {
      multiSigSignatures: arrayUnion(attestationRecord),
      updatedAt: serverTimestamp()
    });

    await awardGovernanceRep(10);
    await logSecurityAudit('MULTISIG_ATTESTATION_SUBMITTED', targetId, {
      proofType: proofData.proofType,
      isProposal
    });

    showToast("✅ Multi-Sig attestation anchored to witness pool!", "success");
    return true;
  } catch (error) {
    console.error("Multi-Sig attestation error:", error);
    showToast("Failed to submit multi-sig attestation.", "error");
    return false;
  }
}

/**
 * Executes a full Circom SNARK or fallback proof and registers high-stakes attestation
 */
export async function handleHighStakesAttestation(targetId, inputs, isProposal = false) {
  try {
    const proofResult = await generateZKProofAsync(inputs);
    if (proofResult) {
      return await submitMultiSigAttestation(targetId, proofResult, isProposal);
    }
  } catch (err) {
    console.error("Failed high-stakes attestation pipeline:", err);
    showToast("High-stakes attestation aborted.", "error");
  }
  return false;
}

/**
 * Evaluates whether a testimony or proposal has satisfied decentralized multi-sig consensus
 */
export function evaluateMultiSigStatus(entityData) {
  const signatures = entityData?.multiSigSignatures || [];
  const count = signatures.length;
  
  const hasZkProof = signatures.some(sig => 
    sig.proofType === "SNARK_GROTH16" || 
    sig.proofType === "SNARK_GROTH16_SERVER" || 
    sig.proofType === "GROTH16_CIRCOM_ZK"
  );

  return {
    isFullyVerified: count >= MINIMUM_MULTISIG_THRESHOLD && hasZkProof,
    signatureCount: count,
    requiredThreshold: MINIMUM_MULTISIG_THRESHOLD,
    hasZkProof,
    status: (count >= MINIMUM_MULTISIG_THRESHOLD && hasZkProof) ? "SEALED_HIGH_STAKES" : "PENDING_WITNESSES"
  };
}

/**
 * Fetch active proposals (for UI)
 */
export async function fetchActiveProposals(max = 20) {
  try {
    const q = query(
      collection(db, "dao_proposals"),
      where("status", "==", "active"),
      orderBy("createdAt", "desc"),
      limit(max)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error("Failed to fetch active proposals:", e);
    return [];
  }
}

/**
 * Get a single proposal by ID
 */
export async function getProposal(proposalId) {
  try {
    const snap = await getDoc(doc(db, "dao_proposals", proposalId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    console.error("Failed to get proposal:", e);
    return null;
  }
}

/**
 * Close / Finalize a proposal (Stewards or original creator)
 */
export async function closeProposal(proposalId, finalStatus = 'closed') {
  if (!auth.currentUser) return showToast("Sign in required", "error");

  try {
    const isSteward = await hasStewardAccess();
    const proposal = await getProposal(proposalId);

    if (!proposal) return showToast("Proposal not found", "error");

    const isCreator = proposal.createdBy === auth.currentUser.uid;

    if (!isSteward && !isCreator) {
      return showToast("Only Stewards or the proposal creator can close it", "error");
    }

    const passed = hasProposalPassed(proposal);

    await updateDoc(doc(db, "dao_proposals", proposalId), {
      status: finalStatus,
      closedAt: serverTimestamp(),
      closedBy: auth.currentUser.uid,
      finalResult: passed ? 'passed' : 'rejected',
      finalVotesFor: proposal.totalVotesFor || 0,
      finalVotesAgainst: proposal.totalVotesAgainst || 0
    });

    await logSecurityAudit('DAO_PROPOSAL_CLOSED', proposalId, {
      finalStatus,
      passed
    });

    showToast(passed ? "✅ Proposal PASSED and closed" : "Proposal closed (did not pass)", "success");
    return true;
  } catch (e) {
    console.error("Close proposal error:", e);
    showToast("Failed to close proposal", "error");
    return false;
  }
}

export const MODERATION_PROFILES = {
  PERMISSIVE: { quorum: 5, approvalRate: 0.51, multiSigRequired: 2 },
  BALANCED:   { quorum: 12, approvalRate: 0.65, multiSigRequired: 3 }, // Your current default
  STRICT:     { quorum: 25, approvalRate: 0.75, multiSigRequired: 5 }
};

export function hasProposalPassed(proposal, profile = MODERATION_PROFILES.BALANCED) {
  const total = (proposal.totalVotesFor || 0) + (proposal.totalVotesAgainst || 0);
  if (total === 0) return false;

  const approvalRatio = proposal.totalVotesFor / total;
  const targetQuorum = proposal.quorum || profile.quorum;

  return approvalRatio >= profile.approvalRate && total >= targetQuorum;
}

// Global Exports
window.submitMultiSigAttestation = submitMultiSigAttestation;
window.handleHighStakesAttestation = handleHighStakesAttestation;
window.evaluateMultiSigStatus = evaluateMultiSigStatus;

// Re-initialize UI on language switch
window.addEventListener('languageChanged', () => {
  if (typeof initDAO === 'function') initDAO();
});
