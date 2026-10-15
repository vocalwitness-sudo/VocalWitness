// js/dao.js — VocalWitness DAO Governance (production-hardened)
// Quadratic voting • Reputation-weighted • Multi-sig • ZK hooks • Discussion
// Votes are server-authoritative via Cloud Function `castDaoVote`.
// Client never mutates totalVotesFor / totalVotesAgainst / voteLog in production.

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
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

import { showToast, escapeHTML } from './utils.js';
import {
  getFunctions,
  httpsCallable
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js';
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
export const MIN_VOTE_STRENGTH = 1;
export const MAX_VOTE_STRENGTH = 5;
export const DEFAULT_QUORUM = 12;

/** Dev-only: allow client vote writes when Cloud Function is unreachable */
const ALLOW_CLIENT_VOTE_FALLBACK =
  typeof location !== 'undefined' &&
  (location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname.endsWith('.local'));

/**
 * Quadratic cost: strength²
 * 1→1, 2→4, 3→9, 4→16, 5→25
 */
export function quadraticCost(strength) {
  const s = Number(strength) || 0;
  return s * s;
}

/** ISO date key for daily budget period (align with Cloud Function) */
export function currentBudgetPeriodKey() {
  return new Date().toISOString().slice(0, 10);
}

function friendlyCallableError(err) {
  const code = err?.code || '';
  const msg = (err?.message || '').replace(/^Firebase:\s*/i, '').trim();
  if (code.includes('unauthenticated') || /sign in/i.test(msg)) {
    return 'Sign in required to vote';
  }
  if (code.includes('already-exists') || /already voted/i.test(msg)) {
    return 'You already voted this direction on this proposal';
  }
  if (code.includes('resource-exhausted') || /budget/i.test(msg)) {
    return 'Voting budget exceeded (max 25 points this period)';
  }
  if (code.includes('permission-denied') || /banned|phone|reputation/i.test(msg)) {
    return msg || 'Not allowed to vote';
  }
  if (code.includes('failed-precondition') || /closed/i.test(msg)) {
    return 'This proposal is closed';
  }
  if (code.includes('not-found')) {
    return 'Proposal or profile not found';
  }
  return msg || 'Vote failed. Please try again.';
}

// ====================== REPUTATION HELPERS ======================

/**
 * Note: Under strict Firestore rules, clients often cannot increment reputation.
 * Prefer server-side awards (Cloud Functions). These helpers remain for soft UX
 * and environments where rules still allow limited client updates.
 */
export async function recordTestimonyContribution() {
  if (!auth.currentUser) return;
  try {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userRef, {
      credibilityScore: increment(BASE_REPUTATION_REWARD),
      reputation: increment(BASE_REPUTATION_REWARD),
      reputationScore: increment(BASE_REPUTATION_REWARD),
      lastContribution: serverTimestamp()
    });
  } catch (e) {
    console.warn('Reputation update failed (may be server-only by rules):', e);
  }
}

async function awardGovernanceRep(points = 5) {
  if (!auth.currentUser) return;
  try {
    const userRef = doc(db, 'users', auth.currentUser.uid);
    await updateDoc(userRef, {
      credibilityScore: increment(points),
      reputation: increment(points),
      reputationScore: increment(points),
      lastGovernanceAction: serverTimestamp()
    });
  } catch (e) {
    console.warn('Governance reputation update failed (may be server-only):', e);
  }
}

// ====================== USER GOVERNANCE POWER ======================

/**
 * Data for the Personal Power Card / budget display.
 * Budget fields are written by Cloud Function on vote; client reads only.
 */
export async function getUserGovernancePower() {
  const empty = {
    reputation: 0,
    remainingBudget: MAX_VOTING_BUDGET_POINTS,
    spentBudget: 0,
    budgetPeriod: currentBudgetPeriodKey(),
    votingWeight: 1,
    tierName: 'Citizen',
    canPropose: false,
    isSignedIn: false
  };

  if (!auth.currentUser) return empty;

  try {
    const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    const userData = userSnap.exists() ? userSnap.data() : {};

    const reputation =
      userData.reputationScore ??
      userData.credibilityScore ??
      userData.reputation ??
      0;

    const votingWeight = (await getUserVotingWeight()) || 1;
    const tier = await getCurrentUserTier();

    const period = currentBudgetPeriodKey();
    const storedPeriod = userData.votingBudgetPeriod || null;
    let spent = Number(userData.votingBudgetSpent) || 0;
    if (storedPeriod !== period) {
      spent = 0;
    }
    const remainingFromField =
      userData.votingBudgetRemaining != null
        ? Number(userData.votingBudgetRemaining)
        : null;
    const remainingBudget =
      storedPeriod === period && remainingFromField != null
        ? Math.max(0, remainingFromField)
        : Math.max(0, MAX_VOTING_BUDGET_POINTS - spent);

    let tierName = 'Citizen';
    if (tier === TIERS.WITNESS_CIRCLE) tierName = 'Witness Circle';
    else if (tier === TIERS.CITIZEN_CIRCLE) tierName = 'Citizen Circle';
    else if (userData.tier === 'steward' || userData.role === 'steward') {
      tierName = 'Steward';
    }

    const canPropose =
      tier === TIERS.WITNESS_CIRCLE ||
      ['admin', 'moderator', 'steward'].includes(userData.role) ||
      userData.tier === 'steward';

    return {
      reputation,
      remainingBudget,
      spentBudget: spent,
      budgetPeriod: period,
      votingWeight,
      tierName,
      canPropose,
      isSignedIn: true
    };
  } catch (e) {
    console.error('Failed to load user governance power:', e);
    return { ...empty, isSignedIn: true };
  }
}

// ====================== CREATE PROPOSAL ======================

export async function createDAOProposal(title, description, category = 'governance') {
  if (!auth.currentUser) {
    showToast('Sign in required to initiate proposals', 'error');
    return null;
  }

  const cleanTitle = String(title || '').trim();
  const cleanDesc = String(description || '').trim();
  if (!cleanTitle || !cleanDesc) {
    showToast('Title and description required', 'error');
    return null;
  }
  if (cleanTitle.length > 120) {
    showToast('Title too long (max 120)', 'error');
    return null;
  }
  if (cleanDesc.length > 800) {
    showToast('Description too long (max 800)', 'error');
    return null;
  }

  try {
    const tier = await getCurrentUserTier();
    const userSnap = await getDoc(doc(db, 'users', auth.currentUser.uid));
    const userData = userSnap.data() || {};

    const canCreate =
      tier === TIERS.WITNESS_CIRCLE ||
      ['admin', 'moderator', 'steward'].includes(userData.role) ||
      userData.tier === 'steward';

    if (!canCreate) {
      showToast(
        'Only Witness Circle members or authorized Stewards can create proposals',
        'error'
      );
      return null;
    }

    const proposalRef = await addDoc(collection(db, 'dao_proposals'), {
      title: cleanTitle,
      description: cleanDesc,
      category: category || 'governance',
      createdBy: auth.currentUser.uid,
      creatorDisplayName: auth.currentUser.displayName || 'Anonymous Witness',
      creatorRole: userData.role || 'citizen',
      createdAt: serverTimestamp(),
      status: 'active',
      totalVotesFor: 0,
      totalVotesAgainst: 0,
      totalVotingPowerSpent: 0,
      quorum: DEFAULT_QUORUM,
      multiSigSignatures: [],
      voteLog: {},
      commentCount: 0
    });

    await awardGovernanceRep(8);
    try {
      await logSecurityAudit('DAO_PROPOSAL_CREATED', proposalRef.id, {
        title: cleanTitle,
        category
      });
    } catch (_) {}

    showToast('✅ Proposal submitted to the people', 'success');
    return proposalRef.id;
  } catch (e) {
    console.error('Proposal creation error:', e);
    showToast('Failed to create proposal', 'error');
    return null;
  }
}

export async function createModerationAppeal(
  postId,
  reason,
  originalDecision = 'purged'
) {
  if (!auth.currentUser) {
    showToast('Sign in required to file an appeal', 'error');
    return null;
  }
  if (!postId || !String(reason || '').trim()) {
    showToast('Post and reason required for appeal', 'error');
    return null;
  }

  const shortId = String(postId).substring(0, 8);
  const title = `Appeal: ${String(originalDecision).toUpperCase()} decision on post ${shortId}…`;
  const description =
    `Community appeal against moderation decision.\n\n` +
    `Original Decision: ${originalDecision}\n` +
    `Post ID: ${postId}\n\n` +
    `Reason for appeal:\n${String(reason).trim()}`;

  const proposalId = await createDAOProposal(
    title,
    description,
    'moderation_appeal'
  );
  if (proposalId) {
    try {
      await updateDoc(doc(db, 'dao_proposals', proposalId), {
        relatedPostId: postId,
        originalDecision
      });
    } catch (e) {
      console.warn('Could not attach appeal metadata:', e);
    }
  }
  return proposalId;
}

// ====================== CAST QUADRATIC VOTE ======================

/**
 * Production path: Cloud Function only.
 * Dev localhost may fall back to client if CF is missing (will still fail
 * under tight rules that forbid client tally writes).
 */
export async function castQuadraticVote(
  proposalId,
  direction,
  strength = 1,
  proofContext = {}
) {
  if (!auth.currentUser) {
    showToast('Sign in required to cast votes', 'error');
    return null;
  }

  const s = Number(strength);
  if (
    !Number.isInteger(s) ||
    s < MIN_VOTE_STRENGTH ||
    s > MAX_VOTE_STRENGTH
  ) {
    showToast('Strength must be an integer between 1 and 5', 'error');
    return null;
  }
  if (!['for', 'against'].includes(direction)) {
    showToast('Invalid vote direction', 'error');
    return null;
  }
  if (!proposalId || typeof proposalId !== 'string') {
    showToast('Invalid proposal', 'error');
    return null;
  }

  try {
    const functions = getFunctions(); // region: match deploy (us-central1)
    const castDaoVote = httpsCallable(functions, 'castDaoVote');
    const result = await castDaoVote({
      proposalId,
      direction,
      strength: s,
      context: proofContext || {}
    });

    const data = result.data || {};
    showToast(
      `Voted ${direction.toUpperCase()} • Cost: ${data.cost ?? quadraticCost(s)} • Power: ${data.effectiveStrength ?? s}`,
      'success'
    );

    try {
      await logSecurityAudit('DAO_VOTE_CAST', proposalId, {
        direction,
        strength: s,
        effectiveStrength: data.effectiveStrength
      });
    } catch (_) {}

    return data;
  } catch (cloudError) {
    console.error('castDaoVote failed:', cloudError);

    if (ALLOW_CLIENT_VOTE_FALLBACK) {
      console.warn('Dev-only client vote fallback');
      return await castQuadraticVoteClient(
        proposalId,
        direction,
        s,
        proofContext
      );
    }

    showToast(friendlyCallableError(cloudError), 'error');
    return null;
  }
}

/**
 * DEV-ONLY fallback. Production rules should reject tally writes.
 * Do not rely on this in live environments.
 */
async function castQuadraticVoteClient(
  proposalId,
  direction,
  strength = 1,
  proofContext = {}
) {
  const userId = auth.currentUser.uid;
  const userRef = doc(db, 'users', userId);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) {
    showToast('User profile not found', 'error');
    return null;
  }

  const userData = userSnap.data();
  const userReputation =
    userData.reputationScore ??
    userData.credibilityScore ??
    userData.reputation ??
    0;

  if (
    !userData.isPhoneVerified &&
    !userData.hasVerifiedPhone &&
    userReputation < 10
  ) {
    if (typeof requireCitizenCirclePermission === 'function') {
      const hasPermission = await requireCitizenCirclePermission();
      if (!hasPermission) return null;
    } else {
      showToast('Phone verification or 10+ reputation required to vote', 'error');
      return null;
    }
  }

  const proposalRef = doc(db, 'dao_proposals', proposalId);
  const proposalSnap = await getDoc(proposalRef);
  if (!proposalSnap.exists()) {
    showToast('Proposal not found', 'error');
    return null;
  }

  const data = proposalSnap.data();
  if (data.status !== 'active') {
    showToast('This proposal is closed', 'error');
    return null;
  }

  const previousVote = data.voteLog?.[userId];
  if (previousVote && previousVote.direction === direction) {
    showToast('You already voted this direction', 'info');
    return null;
  }

  const cost = quadraticCost(strength);
  const currentSpent = previousVote?.cost || 0;
  if (currentSpent + cost > MAX_VOTING_BUDGET_POINTS) {
    showToast('Voting budget exceeded (max 25 points)', 'error');
    return null;
  }

  let zkProof = null;
  try {
    zkProof = await generateRigorousProof({
      action: 'dao_vote',
      proposalId,
      direction,
      strength,
      context: proofContext
    });
  } catch (e) {
    console.warn('ZK Proof skipped:', e);
  }

  const currentTier = await getCurrentUserTier();
  const votingWeight = await getUserVotingWeight();
  const effectiveStrength = Math.min(
    strength * Math.max(1, Math.floor(votingWeight / 2)),
    8
  );

  // Reverse previous side if switching
  let totalFor = data.totalVotesFor || 0;
  let totalAgainst = data.totalVotesAgainst || 0;
  if (previousVote) {
    if (previousVote.direction === 'for') {
      totalFor = Math.max(0, totalFor - (previousVote.effectiveStrength || 0));
    } else if (previousVote.direction === 'against') {
      totalAgainst = Math.max(
        0,
        totalAgainst - (previousVote.effectiveStrength || 0)
      );
    }
  }
  if (direction === 'for') totalFor += effectiveStrength;
  else totalAgainst += effectiveStrength;

  try {
    await updateDoc(proposalRef, {
      totalVotesFor: totalFor,
      totalVotesAgainst: totalAgainst,
      totalVotingPowerSpent: (data.totalVotingPowerSpent || 0) + cost,
      [`voteLog.${userId}`]: {
        direction,
        strength,
        effectiveStrength,
        cost: currentSpent + cost,
        voterTier: currentTier || 'citizen',
        voterRole: userData.role || 'citizen',
        votingWeight,
        zkProof: zkProof ? zkProof.hash || zkProof : null,
        timestamp: serverTimestamp()
      },
      updatedAt: serverTimestamp()
    });
  } catch (e) {
    console.error('Client vote write rejected (expected under prod rules):', e);
    showToast(
      'Vote blocked by security rules. Use Cloud Function in production.',
      'error'
    );
    return null;
  }

  await awardGovernanceRep(3);
  try {
    await logSecurityAudit('DAO_VOTE_CAST', proposalId, {
      direction,
      strength,
      effectiveStrength,
      fallback: true
    });
  } catch (_) {}

  showToast(
    `Voted ${direction.toUpperCase()} • Cost: ${cost} • Power: ${effectiveStrength}`,
    'success'
  );
  return { cost, effectiveStrength, fallback: true };
}

// ====================== MULTI-SIG ======================

export async function submitMultiSigAttestation(
  targetId,
  proofData,
  isProposal = false
) {
  if (!auth.currentUser) {
    showToast('Authentication required', 'error');
    return false;
  }
  if (!targetId) {
    showToast('Invalid target', 'error');
    return false;
  }

  try {
    const collectionName = isProposal ? 'dao_proposals' : 'testimonies';
    const targetRef = doc(db, collectionName, targetId);

    const attestationRecord = {
      witnessUid: auth.currentUser.uid,
      proofType: proofData?.proofType || 'UNKNOWN',
      publicSignalsHash: proofData?.publicSignals
        ? proofData.publicSignals[0]
        : proofData?.proof?.hash || proofData?.payloadHash || null,
      isFallback: !!proofData?.isFallback,
      signedAt: new Date().toISOString()
    };

    await updateDoc(targetRef, {
      multiSigSignatures: arrayUnion(attestationRecord),
      updatedAt: serverTimestamp()
    });

    await awardGovernanceRep(10);
    try {
      await logSecurityAudit('MULTISIG_ATTESTATION_SUBMITTED', targetId, {
        proofType: proofData?.proofType,
        isProposal
      });
    } catch (_) {}

    showToast('✅ Multi-Sig attestation sealed', 'success');
    return true;
  } catch (error) {
    console.error('Multi-Sig error:', error);
    showToast('Failed to submit multi-sig attestation', 'error');
    return false;
  }
}

export async function handleHighStakesAttestation(
  targetId,
  inputs,
  isProposal = false
) {
  try {
    const proofResult = await generateZKProofAsync(inputs);
    if (proofResult) {
      return await submitMultiSigAttestation(targetId, proofResult, isProposal);
    }
  } catch (err) {
    console.error('High-stakes attestation failed:', err);
    showToast('High-stakes attestation failed', 'error');
  }
  return false;
}

export function evaluateMultiSigStatus(entityData) {
  const signatures = entityData?.multiSigSignatures || [];
  const count = signatures.length;

  const hasZkProof = signatures.some((sig) => {
    const t = (sig.proofType || '').toUpperCase();
    return t.includes('GROTH16') || t.includes('ZK');
  });

  const sealed = count >= MINIMUM_MULTISIG_THRESHOLD && hasZkProof;

  return {
    isFullyVerified: sealed,
    signatureCount: count,
    requiredThreshold: MINIMUM_MULTISIG_THRESHOLD,
    hasZkProof,
    status: sealed ? 'SEALED_HIGH_STAKES' : 'PENDING_WITNESSES'
  };
}
// ====================== DISCUSSION / COMMENTS ======================

const commentUnsubscribers = {};

export async function postDAOComment(proposalId, content) {
  if (!auth.currentUser) {
    showToast('Please sign in to comment', 'error');
    return false;
  }

  const trimmed = String(content || '').trim();
  if (!trimmed) {
    showToast('Comment cannot be empty', 'error');
    return false;
  }
  if (trimmed.length > 400) {
    showToast('Comment too long (max 400 characters)', 'error');
    return false;
  }
  if (!proposalId) {
    showToast('Invalid proposal', 'error');
    return false;
  }

  try {
    await addDoc(collection(db, 'dao_comments'), {
      proposalId,
      content: trimmed,
      authorId: auth.currentUser.uid,
      authorName: auth.currentUser.displayName || 'Anonymous Citizen',
      createdAt: serverTimestamp()
    });

    try {
      await updateDoc(doc(db, 'dao_proposals', proposalId), {
        commentCount: increment(1),
        updatedAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('commentCount bump failed (rules may limit):', e);
    }

    await awardGovernanceRep(2);
    showToast('Comment published', 'success');
    return true;
  } catch (err) {
    console.error('Failed to post comment:', err);
    showToast('Failed to post comment', 'error');
    return false;
  }
}

export function subscribeToProposalComments(proposalId, callback) {
  if (!proposalId || typeof callback !== 'function') {
    return () => {};
  }

  if (commentUnsubscribers[proposalId]) {
    try {
      commentUnsubscribers[proposalId]();
    } catch (_) {}
  }

  const q = query(
    collection(db, 'dao_comments'),
    where('proposalId', '==', proposalId),
    orderBy('createdAt', 'asc')
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const comments = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      callback(comments);
    },
    (error) => {
      console.error('Comments listener error:', error);
      callback([]);
    }
  );

  commentUnsubscribers[proposalId] = unsubscribe;
  return unsubscribe;
}

export function unsubscribeFromComments(proposalId) {
  if (proposalId && commentUnsubscribers[proposalId]) {
    try {
      commentUnsubscribers[proposalId]();
    } catch (_) {}
    delete commentUnsubscribers[proposalId];
  }
}

export function unsubscribeAllComments() {
  Object.keys(commentUnsubscribers).forEach((id) => {
    unsubscribeFromComments(id);
  });
}

// ====================== FETCH & LIFECYCLE ======================

/**
 * Fetch recent proposals (any status) for filters: all / active / passed / closed
 */
export async function fetchProposals(max = 40) {
  try {
    const q = query(
      collection(db, 'dao_proposals'),
      orderBy('createdAt', 'desc'),
      limit(max)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('Failed to fetch proposals:', e);
    // Fallback: active-only if composite/index issues
    try {
      return await fetchActiveProposals(max);
    } catch (_) {
      return [];
    }
  }
}

export async function fetchActiveProposals(max = 20) {
  try {
    const q = query(
      collection(db, 'dao_proposals'),
      where('status', '==', 'active'),
      orderBy('createdAt', 'desc'),
      limit(max)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.error('Failed to fetch active proposals:', e);
    return [];
  }
}

export async function getProposal(proposalId) {
  if (!proposalId) return null;
  try {
    const snap = await getDoc(doc(db, 'dao_proposals', proposalId));
    if (!snap.exists()) return null;
    return { id: snap.id, ...snap.data() };
  } catch (e) {
    console.error('Failed to fetch proposal:', e);
    return null;
  }
}

/**
 * Close proposal: creator or steward.
 * Sets status closed + finalResult passed|rejected from current tallies.
 */
export async function closeProposal(proposalId, finalStatus = 'closed') {
  if (!auth.currentUser) {
    showToast('Sign in required', 'error');
    return false;
  }
  if (!proposalId) {
    showToast('Invalid proposal', 'error');
    return false;
  }

  try {
    const isSteward = await hasStewardAccess();
    const proposal = await getProposal(proposalId);
    if (!proposal) {
      showToast('Proposal not found', 'error');
      return false;
    }

    if (proposal.status === 'closed') {
      showToast('Proposal already closed', 'info');
      return true;
    }

    const isCreator = proposal.createdBy === auth.currentUser.uid;
    if (!isSteward && !isCreator) {
      showToast('Only Stewards or the creator can close this proposal', 'error');
      return false;
    }

    const passed = hasProposalPassed(proposal);
    const status = finalStatus === 'closed' ? 'closed' : finalStatus;

    await updateDoc(doc(db, 'dao_proposals', proposalId), {
      status,
      closedAt: serverTimestamp(),
      closedBy: auth.currentUser.uid,
      finalResult: passed ? 'passed' : 'rejected',
      finalVotesFor: proposal.totalVotesFor || 0,
      finalVotesAgainst: proposal.totalVotesAgainst || 0,
      updatedAt: serverTimestamp()
    });

    try {
      await logSecurityAudit('DAO_PROPOSAL_CLOSED', proposalId, {
        finalStatus: status,
        passed,
        finalResult: passed ? 'passed' : 'rejected'
      });
    } catch (_) {}

    showToast(
      passed ? '✅ Proposal PASSED and closed' : 'Proposal closed (did not pass)',
      'success'
    );
    return true;
  } catch (e) {
    console.error('Close proposal error:', e);
    showToast('Failed to close proposal', 'error');
    return false;
  }
}

// ====================== PASSING LOGIC ======================

export const MODERATION_PROFILES = {
  PERMISSIVE: { quorum: 5, approvalRate: 0.51, multiSigRequired: 2 },
  BALANCED: { quorum: 12, approvalRate: 0.65, multiSigRequired: 3 },
  STRICT: { quorum: 25, approvalRate: 0.75, multiSigRequired: 5 }
};

/**
 * Live threshold check (while status === 'active').
 * For closed proposals, prefer proposal.finalResult.
 */
export function hasProposalPassed(
  proposal,
  profile = MODERATION_PROFILES.BALANCED
) {
  if (!proposal) return false;

  if (proposal.status === 'closed') {
    return proposal.finalResult === 'passed';
  }

  const total =
    (proposal.totalVotesFor || 0) + (proposal.totalVotesAgainst || 0);
  if (total === 0) return false;

  const approvalRatio = (proposal.totalVotesFor || 0) / total;
  const targetQuorum = proposal.quorum || profile.quorum;
  return approvalRatio >= profile.approvalRate && total >= targetQuorum;
}

/** UI helper: active | passing | closed_passed | closed_rejected | closed */
export function getProposalDisplayStatus(proposal) {
  if (!proposal) return 'unknown';
  if (proposal.status === 'closed') {
    if (proposal.finalResult === 'passed') return 'closed_passed';
    if (proposal.finalResult === 'rejected') return 'closed_rejected';
    return 'closed';
  }
  if (hasProposalPassed(proposal)) return 'passing';
  return 'active';
}

// ====================== OPTIONAL WINDOW EXPORTS ======================
// dao.html should import ES modules and wire UI itself.
// These remain for legacy pages that call window.* helpers.

if (typeof window !== 'undefined') {
  window.submitMultiSigAttestation = submitMultiSigAttestation;
  window.handleHighStakesAttestation = handleHighStakesAttestation;
  window.evaluateMultiSigStatus = evaluateMultiSigStatus;
  window.postDAOComment = postDAOComment;
  window.subscribeToProposalComments = subscribeToProposalComments;
  window.unsubscribeFromComments = unsubscribeFromComments;
  window.unsubscribeAllComments = unsubscribeAllComments;
  window.castQuadraticVote = castQuadraticVote;
  window.createDAOProposal = createDAOProposal;
  window.closeProposal = closeProposal;
  window.hasProposalPassed = hasProposalPassed;
  window.getProposalDisplayStatus = getProposalDisplayStatus;
  window.getUserGovernancePower = getUserGovernancePower;
  window.fetchProposals = fetchProposals;
  window.fetchActiveProposals = fetchActiveProposals;
  // Intentionally NOT exporting window.toggleDiscussion / window.postComment
  // so dao.html owns discussion UI without duplicate handlers.
}

export {
  escapeHTML // re-export if utils already exports; safe if tree-shaken
};
