// js/dao.js - Enhanced Quadratic Voting, Multi-Sig Governance, Cryptographic Trust + Proposal Discussion
// Democratic by nature – The people decide

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
  onSnapshot,
  increment
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import { showToast, escapeHTML } from './utils.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
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

// ====================== CONSTANTS ======================
export const MINIMUM_MULTISIG_THRESHOLD = 3;
export const MAX_VOTING_BUDGET_POINTS = 25;
export const BASE_REPUTATION_REWARD = 15;

/**
 * Quadratic cost formula
 * strength 1 → 1 point
 * strength 2 → 4 points
 * strength 3 → 9 points
 * strength 4 → 16 points
 * strength 5 → 25 points
 */
function quadraticCost(strength) {
  return strength * strength;
}

// ====================== REPUTATION HELPERS ======================

export async function recordTestimonyContribution() {
  if (!auth.currentUser) return;
  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    await updateDoc(userRef, {
      credibilityScore: increment(BASE_REPUTATION_REWARD),
      reputation: increment(BASE_REPUTATION_REWARD),
      lastContribution: serverTimestamp()
    });
    console.log("✅ +15 Reputation awarded for verified testimony");
  } catch (e) {
    console.warn("Reputation update failed:", e);
  }
}

async function awardGovernanceRep(points = 5) {
  if (!auth.currentUser) return;
  try {
    const userRef = doc(db, "users", auth.currentUser.uid);
    await updateDoc(userRef, {
      credibilityScore: increment(points),
      reputation: increment(points),
      lastGovernanceAction: serverTimestamp()
    });
  } catch (e) {
    console.warn("Governance reputation update failed:", e);
  }
}

// ====================== GET USER POWER DATA (for Power Card) ======================

/**
 * Returns the data needed for the Personal Power Card
 */
export async function getUserGovernancePower() {
  if (!auth.currentUser) {
    return {
      reputation: 0,
      remainingBudget: MAX_VOTING_BUDGET_POINTS,
      votingWeight: 1,
      tierName: 'Citizen',
      canPropose: false
    };
  }

  try {
    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    const reputation = userData.credibilityScore || userData.reputation || 0;
    const votingWeight = await getUserVotingWeight() || 1;
    const tier = await getCurrentUserTier();

    // Calculate remaining budget (you can improve this later with real spent tracking)
    const remainingBudget = userData.votingBudgetRemaining ?? MAX_VOTING_BUDGET_POINTS;

    let tierName = 'Citizen';
    if (tier === TIERS.WITNESS_CIRCLE) tierName = 'Witness Circle';
    else if (tier === TIERS.CITIZEN_CIRCLE) tierName = 'Citizen Circle';

    const canPropose = tier === TIERS.WITNESS_CIRCLE || 
                       ['admin', 'moderator', 'steward'].includes(userData.role);

    return {
      reputation,
      remainingBudget,
      votingWeight,
      tierName,
      canPropose
    };
  } catch (e) {
    console.error("Failed to load user governance power:", e);
    return {
      reputation: 0,
      remainingBudget: MAX_VOTING_BUDGET_POINTS,
      votingWeight: 1,
      tierName: 'Citizen',
      canPropose: false
    };
  }
}

// ====================== CREATE PROPOSAL ======================

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
    await logSecurityAudit('DAO_PROPOSAL_CREATED', proposalRef.id, { title, category });

    showToast("✅ Proposal submitted to the people", "success");
    return proposalRef.id;
  } catch (e) {
    console.error("Proposal creation error:", e);
    showToast("Failed to create proposal", "error");
    return null;
  }
}

export async function createModerationAppeal(postId, reason, originalDecision = 'purged') {
  if (!auth.currentUser) return showToast("Sign in required to file an appeal", "error");

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
}

// ====================== CAST QUADRATIC VOTE (Single Clean Version) ======================

/**
 * Main voting function – uses Cloud Function when available, falls back to client
 */
export async function castQuadraticVote(proposalId, direction, strength = 1, proofContext = {}) {
  if (!auth.currentUser) {
    return showToast("Sign in required to cast votes", "error");
  }
  if (strength < 1 || strength > 5) {
    return showToast("Strength must be between 1 and 5", "error");
  }
  if (!['for', 'against'].includes(direction)) {
    return showToast("Invalid vote direction", "error");
  }

  // Prefer Cloud Function (more secure)
  try {
    const functions = getFunctions();
    const castDaoVote = httpsCallable(functions, 'castDaoVote');
    const result = await castDaoVote({
      proposalId,
      direction,
      strength: Number(strength),
      context: proofContext || {}
    });

    const data = result.data || {};
    showToast(
      `Voted ${direction.toUpperCase()} • Cost: ${data.cost || strength * strength} • Power: ${data.effectiveStrength || strength}`,
      "success"
    );

    await logSecurityAudit('DAO_VOTE_CAST', proposalId, {
      direction,
      strength,
      effectiveStrength: data.effectiveStrength
    });

    return data;
  } catch (cloudError) {
    console.warn("Cloud Function vote failed, falling back to client-side:", cloudError);

    // ========== CLIENT-SIDE FALLBACK ==========
    return await castQuadraticVoteClient(proposalId, direction, strength, proofContext);
  }
}

/**
 * Client-side fallback voting (used if Cloud Function is not ready)
 */
async function castQuadraticVoteClient(proposalId, direction, strength = 1, proofContext = {}) {
  const userId = auth.currentUser.uid;
  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return showToast("User profile not found", "error");

  const userData = userSnap.data();
  const userReputation = userData.credibilityScore || userData.reputation || 0;

  if (!userData.isPhoneVerified && !userData.hasVerifiedPhone && userReputation < 10) {
    if (typeof requireCitizenCirclePermission === 'function') {
      const hasPermission = await requireCitizenCirclePermission();
      if (!hasPermission) return null;
    } else {
      return showToast("Phone verification or 10+ reputation required to vote", "error");
    }
  }

  const proposalRef = doc(db, "dao_proposals", proposalId);
  const proposalSnap = await getDoc(proposalRef);
  if (!proposalSnap.exists()) return showToast("Proposal not found", "error");

  const data = proposalSnap.data();
  if (data.status !== 'active') {
    return showToast("This proposal is closed", "error");
  }

  const previousVote = data.voteLog?.[userId];
  if (previousVote && previousVote.direction === direction) {
    return showToast("You already voted this direction", "info");
  }

  const cost = quadraticCost(strength);
  const currentSpent = previousVote?.cost || 0;
  if (currentSpent + cost > MAX_VOTING_BUDGET_POINTS) {
    return showToast("Voting budget exceeded (max 25 points)", "error");
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
    console.warn("ZK Proof skipped:", e);
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

  showToast(`Voted ${direction.toUpperCase()} • Cost: ${cost} • Power: ${effectiveStrength}`, "success");
  return { cost, effectiveStrength };
}

// ====================== MULTI-SIG ======================

export async function submitMultiSigAttestation(targetId, proofData, isProposal = false) {
  if (!auth.currentUser) {
    showToast("Authentication required", "error");
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

    showToast("✅ Multi-Sig attestation sealed", "success");
    return true;
  } catch (error) {
    console.error("Multi-Sig error:", error);
    showToast("Failed to submit multi-sig attestation", "error");
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
    console.error("High-stakes attestation failed:", err);
    showToast("High-stakes attestation failed", "error");
  }
  return false;
}

export function evaluateMultiSigStatus(entityData) {
  const signatures = entityData?.multiSigSignatures || [];
  const count = signatures.length;

  const hasZkProof = signatures.some(sig =>
    (sig.proofType || "").toUpperCase().includes("GROTH16") ||
    (sig.proofType || "").toUpperCase().includes("ZK")
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

// ====================== DISCUSSION ======================

const commentUnsubscribers = {};

export async function postDAOComment(proposalId, content) {
  if (!auth.currentUser) {
    showToast("Please sign in to comment", "error");
    return false;
  }

  const trimmed = content?.trim();
  if (!trimmed) {
    showToast("Comment cannot be empty", "error");
    return false;
  }
  if (trimmed.length > 400) {
    showToast("Comment too long (max 400 characters)", "error");
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

    await updateDoc(doc(db, "dao_proposals", proposalId), {
      commentCount: increment(1)
    });

    await awardGovernanceRep(2);
    showToast("Comment published", "success");
    return true;
  } catch (err) {
    console.error("Failed to post comment:", err);
    showToast("Failed to post comment", "error");
    return false;
  }
}

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
    const comments = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    callback(comments);
  }, (error) => {
    console.error("Comments listener error:", error);
    callback([]);
  });

  commentUnsubscribers[proposalId] = unsubscribe;
  return unsubscribe;
}

export function unsubscribeFromComments(proposalId) {
  if (commentUnsubscribers[proposalId]) {
    commentUnsubscribers[proposalId]();
    delete commentUnsubscribers[proposalId];
  }
}

// ====================== FETCH & LIFECYCLE ======================

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
    console.error("Failed to fetch proposals:", e);
    return [];
  }
}

export async function getProposal(proposalId) {
  try {
    const snap = await getDoc(doc(db, "dao_proposals", proposalId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    console.error("Failed to fetch proposal:", e);
    return null;
  }
}

export async function closeProposal(proposalId, finalStatus = 'closed') {
  if (!auth.currentUser) return showToast("Sign in required", "error");

  try {
    const isSteward = await hasStewardAccess();
    const proposal = await getProposal(proposalId);
    if (!proposal) return showToast("Proposal not found", "error");

    const isCreator = proposal.createdBy === auth.currentUser.uid;
    if (!isSteward && !isCreator) {
      return showToast("Only Stewards or the creator can close this proposal", "error");
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

    await logSecurityAudit('DAO_PROPOSAL_CLOSED', proposalId, { finalStatus, passed });

    showToast(passed ? "✅ Proposal PASSED" : "Proposal closed (did not pass)", "success");
    return true;
  } catch (e) {
    console.error("Close proposal error:", e);
    showToast("Failed to close proposal", "error");
    return false;
  }
}

// ====================== PASSING LOGIC ======================

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

// ====================== WINDOW HELPERS ======================

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
          <span class="text-xs font-medium text-emerald-400">${escapeHTML(c.authorName || 'Anonymous')}</span>
          <span class="text-[10px] text-zinc-500">${time}</span>
        </div>
        <p class="text-sm leading-relaxed text-zinc-300">${escapeHTML(c.content)}</p>
      `;
      list.appendChild(el);
    });

    list.scrollTop = list.scrollHeight;
  });
}

window.postComment = async function (proposalId) {
  const input = document.getElementById(`comment-input-${proposalId}`);
  const content = input?.value.trim();
  if (!content) return showToast('Write something first', 'error');

  const success = await postDAOComment(proposalId, content);
  if (success && input) input.value = '';
};

// Global exports
window.submitMultiSigAttestation = submitMultiSigAttestation;
window.handleHighStakesAttestation = handleHighStakesAttestation;
window.evaluateMultiSigStatus = evaluateMultiSigStatus;
window.postDAOComment = postDAOComment;
window.subscribeToProposalComments = subscribeToProposalComments;
window.unsubscribeFromComments = unsubscribeFromComments;
