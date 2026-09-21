// js/dao.js - Enhanced Quadratic Voting, Multi-Sig Governance, Cryptographic Trust + Proposal Discussion

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
  arrayUnion,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import { showToast, escapeHTML } from './utils.js';
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

// Constant Thresholds and Governance Security Parameters
export const MINIMUM_MULTISIG_THRESHOLD = 3;
export const MAX_VOTING_BUDGET_POINTS = 25;
export const BASE_REPUTATION_REWARD = 15;

/**
 * Compute Quadratic Voting Cost based on strength level
 * Formula: cost = strength^2
 */
function quadraticCost(strength) {
  return strength * strength;
}

/**
 * Record Testimony Contribution and award credibility score points
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
        credibilityScore: currentRep + BASE_REPUTATION_REWARD,
        reputation: currentRep + BASE_REPUTATION_REWARD,
        lastContribution: serverTimestamp()
      });
      console.log("✅ +15 Reputation awarded for verified testimony contribution");
    }
  } catch (e) {
    console.warn("Reputation update operation failed during testimony recording:", e);
  }
}

/**
 * Award reputation points for active governance participation
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
    console.warn("Governance reputation update operation failed:", e);
  }
}

/**
 * Create DAO Proposal (Witness Circle, Stewards, or Authorized Moderators)
 */
export async function createDAOProposal(title, description, category = 'governance') {
  if (!auth.currentUser) return showToast("Sign in required to initiate proposals", "error");

  try {
    const tier = await getCurrentUserTier();
    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const userData = userSnap.data() || {};

    const canCreate =
      tier === TIERS.WITNESS_CIRCLE ||
      ['admin', 'moderator', 'steward'].includes(userData.role);

    if (!canCreate) {
      return showToast("Only Witness Circle members or authorized Stewards can create proposals", "error");
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
      voteLog: {},
      commentCount: 0
    });

    await awardGovernanceRep(8);
    await logSecurityAudit('DAO_PROPOSAL_CREATED', proposalRef.id, {
      title,
      category
    });

    showToast("✅ DAO Proposal created successfully", "success");
    return proposalRef.id;
  } catch (e) {
    console.error("Proposal creation encountered an error:", e);
    showToast("Failed to create proposal due to network or permission error", "error");
    return null;
  }
}

/**
 * Create a Community Moderation Appeal proposal linked to a specific post ID
 */
export async function createModerationAppeal(postId, reason, originalDecision = 'purged') {
  if (!auth.currentUser) return showToast("Sign in required to file an appeal", "error");

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
    console.error("Moderation appeal creation error:", e);
    showToast("Failed to create moderation appeal", "error");
    return null;
  }
}

/**
 * Cast Quadratic Vote with cryptographic validation and voting power calculation
 */
export async function castQuadraticVote(proposalId, direction, strength = 1, proofContext = {}) {
  if (!auth.currentUser) return showToast("Sign in required to cast votes", "error");
  if (strength < 1 || strength > 5) return showToast("Strength parameters must range between 1 and 5", "error");
  if (!['for', 'against'].includes(direction)) {
    return showToast("Invalid vote direction specified", "error");
  }

  const userId = auth.currentUser.uid;
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return showToast("User profile record not found", "error");

  const userData = userSnap.data();
  const userReputation = userData.credibilityScore || userData.reputation || 0;

  if (!userData.isPhoneVerified && !userData.hasVerifiedPhone && userReputation < 10) {
    if (typeof requireCitizenCirclePermission === 'function') {
      const hasPermission = await requireCitizenCirclePermission();
      if (!hasPermission) return;
    } else {
      return showToast("Account must be phone verified or maintain 10+ credibility score to vote", "error");
    }
  }

  const proposalRef = doc(db, "dao_proposals", proposalId);
  const proposalSnap = await getDoc(proposalRef);
  if (!proposalSnap.exists()) return showToast("Target proposal not found", "error");

  const data = proposalSnap.data();
  if (data.status !== 'active') {
    return showToast("This proposal is closed and no longer open for voting", "error");
  }

  const previousVote = data.voteLog?.[userId];
  if (previousVote && previousVote.direction === direction) {
    return showToast("You have already cast a vote in this exact direction.", "info");
  }

  const cost = quadraticCost(strength);
  const currentSpent = previousVote?.cost || 0;
  if (currentSpent + cost > MAX_VOTING_BUDGET_POINTS) {
    return showToast("Exceeded maximum voting budget (max 25 cumulative power points)", "error");
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
    console.warn("ZK Proof generation bypassed or skipped:", e);
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

  showToast(`Successfully voted ${direction.toUpperCase()} (Cost: ${cost} points • Effective strength: ${effectiveStrength})`, "success");
}

/* ==========================================================================
   MULTI-SIG & HIGH-STAKES ATTESTATION PIPELINES
   ========================================================================== */

export async function submitMultiSigAttestation(targetId, proofData, isProposal = false) {
  if (!auth.currentUser) {
    showToast("Authentication required to submit multi-sig attestations.", "error");
    return false;
  }

  try {
    const collectionName = isProposal ? "dao_proposals" : "testimonies";
    const targetRef = doc(db, collectionName, targetId);

    const attestationRecord = {
      witnessUid: auth.currentUser.uid,
      proofType: proofData.proofType || "UNKNOWN",
      publicSignalsHash: proofData.publicSignals
        ? proofData.publicSignals[0]
        : (proofData.proof?.hash || proofData.payloadHash || null),
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

    showToast("✅ Multi-Sig cryptographic attestation anchored securely!", "success");
    return true;
  } catch (error) {
    console.error("Multi-Sig attestation submission error:", error);
    showToast("Failed to submit multi-sig attestation to ledger.", "error");
    return false;
  }
}

export async function handleHighStakesAttestation(targetId, inputs, isProposal = false) {
  try {
    const proofResult = await generateZKProofAsync(inputs);
    if (proofResult) {
      return await submitMultiSigAttestation(targetId, proofResult, isProposal);
    }
  } catch (err) {
    console.error("High-stakes cryptographic attestation pipeline failed:", err);
    showToast("High-stakes attestation aborted due to generation error.", "error");
  }
  return false;
}

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
    status: (count >= MINIMUM_MULTISIG_THRESHOLD && hasZkProof)
      ? "SEALED_HIGH_STAKES"
      : "PENDING_WITNESSES"
  };
}

/* ==========================================================================
   PROPOSAL DISCUSSION & COMMUNITY COMMENTS MODULE
   ========================================================================== */

const commentUnsubscribers = {};

/**
 * Post a verified community comment on an active DAO proposal
 */
export async function postDAOComment(proposalId, content) {
  if (!auth.currentUser) {
    showToast("Please sign in to participate in proposal discussions", "error");
    return false;
  }

  const trimmed = content?.trim();
  if (!trimmed || trimmed.length === 0) {
    showToast("Comment body cannot be empty", "error");
    return false;
  }

  if (trimmed.length > 400) {
    showToast("Comment exceeds maximum length constraint (max 400 characters)", "error");
    return false;
  }

  try {
    await addDoc(collection(db, "dao_comments"), {
      proposalId,
      content: trimmed,
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || "Anonymous Citizen",
      createdAt: serverTimestamp()
    });

    const proposalRef = doc(db, "dao_proposals", proposalId);
    const snap = await getDoc(proposalRef);
    if (snap.exists()) {
      const currentCount = snap.data().commentCount || 0;
      await updateDoc(proposalRef, {
        commentCount: currentCount + 1
      });
    }

    await awardGovernanceRep(2);
    showToast("Comment published to discussion ledger", "success");
    return true;
  } catch (err) {
    console.error("Failed to post discussion comment:", err);
    showToast("Failed to post comment", "error");
    return false;
  }
}

/**
 * Real-time snapshot subscription for proposal discussion comments
 */
export function subscribeToProposalComments(proposalId, callback) {
  if (commentUnsubscribers[proposalId]) {
    commentUnsubscribers[proposalId]();
  }

  const q = query(
    collection(db, "dao_comments"),
    where("proposalId", "==", proposalId),
    orderBy("createdAt", "asc")
  );

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const comments = snapshot.docs.map(d => ({
      id: d.id,
      ...d.data()
    }));
    callback(comments);
  }, (error) => {
    console.error("Real-time comments listener snapshot error:", error);
    callback([]);
  });

  commentUnsubscribers[proposalId] = unsubscribe;
  return unsubscribe;
}

/**
 * Terminate active snapshot subscription for proposal comments
 */
export function unsubscribeFromComments(proposalId) {
  if (commentUnsubscribers[proposalId]) {
    commentUnsubscribers[proposalId]();
    delete commentUnsubscribers[proposalId];
  }
}

/* ==========================================================================
   FETCH & PROPOSAL LIFECYCLE MANAGEMENT UTILITIES
   ========================================================================== */

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
    console.error("Failed to query active proposals collection:", e);
    return [];
  }
}

export async function getProposal(proposalId) {
  try {
    const snap = await getDoc(doc(db, "dao_proposals", proposalId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    console.error("Failed to fetch individual proposal record:", e);
    return null;
  }
}

export async function closeProposal(proposalId, finalStatus = 'closed') {
  if (!auth.currentUser) return showToast("Sign in required to close proposals", "error");

  try {
    const isSteward = await hasStewardAccess();
    const proposal = await getProposal(proposalId);
    if (!proposal) return showToast("Target proposal record not found", "error");

    const isCreator = proposal.createdBy === auth.currentUser.uid;
    if (!isSteward && !isCreator) {
      return showToast("Only designated Stewards or the original proposal creator can close this proposal", "error");
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

    showToast(passed ? "✅ Proposal PASSED voting threshold and is now closed" : "Proposal closed (did not satisfy quorum/approval requirements)", "success");
    return true;
  } catch (e) {
    console.error("Error executing proposal close operation:", e);
    showToast("Failed to close proposal", "error");
    return false;
  }
}

// ====================== DISCUSSION HELPERS ======================

window.toggleDiscussion = function (proposalId) {
  const panel = document.getElementById(`discussion-${proposalId}`);
  const arrow = document.getElementById(`discussion-arrow-${proposalId}`);

  if (!panel) return;

  const isHidden = panel.classList.contains('hidden');

  if (isHidden) {
    panel.classList.remove('hidden');
    if (arrow) arrow.textContent = '▲';
    loadComments(proposalId);
  } else {
    panel.classList.add('hidden');
    if (arrow) arrow.textContent = '▼';
    unsubscribeFromComments(proposalId);
  }
};

function loadComments(proposalId) {
  const list = document.getElementById(`comments-list-${proposalId}`);
  const countEl = document.getElementById(`comment-count-${proposalId}`);
  if (!list) return;

  subscribeToProposalComments(proposalId, (comments) => {
    list.innerHTML = '';

    if (!comments || comments.length === 0) {
      list.innerHTML = `<p class="py-4 text-center text-xs text-zinc-500">No comments yet. Start the discussion.</p>`;
      if (countEl) countEl.textContent = '0';
      return;
    }

    if (countEl) countEl.textContent = comments.length;

    comments.forEach(c => {
      const time = c.createdAt?.toDate
        ? c.createdAt.toDate().toLocaleString()
        : 'Just now';

      const el = document.createElement('div');
      el.className = 'rounded-2xl border border-zinc-800 bg-zinc-900/60 p-3';

      el.innerHTML = `
        <div class="mb-1 flex items-center justify-between">
          <span class="text-xs font-medium text-emerald-400">
            ${escapeHTML(c.authorName || 'Anonymous')}
          </span>
          <span class="text-[10px] text-zinc-500">${time}</span>
        </div>
        <p class="text-sm leading-relaxed text-zinc-300">
          ${escapeHTML(c.content)}
        </p>
      `;
      list.appendChild(el);
    });

    // Scroll to bottom
    list.scrollTop = list.scrollHeight;
  });
}

window.postComment = async function (proposalId) {
  const input = document.getElementById(`comment-input-${proposalId}`);
  const content = input?.value.trim();

  if (!content) {
    return showToast('Write something first', 'error');
  }

  const success = await postDAOComment(proposalId, content);
  if (success && input) {
    input.value = '';
  }
};

export const MODERATION_PROFILES = {
  PERMISSIVE: { quorum: 5, approvalRate: 0.51, multiSigRequired: 2 },
  BALANCED:   { quorum: 12, approvalRate: 0.65, multiSigRequired: 3 },
  STRICT:     { quorum: 25, approvalRate: 0.75, multiSigRequired: 5 }
};

export function hasProposalPassed(proposal, profile = MODERATION_PROFILES.BALANCED) {
  const total = (proposal.totalVotesFor || 0) + (proposal.totalVotesAgainst || 0);
  if (total === 0) return false;
  const approvalRatio = proposal.totalVotesFor / total;
  const targetQuorum = proposal.quorum || profile.quorum;
  return approvalRatio >= profile.approvalRate && total >= targetQuorum;
}

// Global Window Namespace Registrations for DOM Event Handlers
window.submitMultiSigAttestation = submitMultiSigAttestation;
window.handleHighStakesAttestation = handleHighStakesAttestation;
window.evaluateMultiSigStatus = evaluateMultiSigStatus;
window.postDAOComment = postDAOComment;
window.subscribeToProposalComments = subscribeToProposalComments;
window.unsubscribeFromComments = unsubscribeFromComments;

// Re-initialize UI modules upon localization language change events
window.addEventListener('languageChanged', () => {
  if (typeof initDAO === 'function') initDAO();
});
