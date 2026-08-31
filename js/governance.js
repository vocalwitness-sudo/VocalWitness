/**
 * js/governance.js
 * Governance, Synthetic Media Reports, Multi-Sig Attestation & Steward Consensus Engine.
 * 
 * - Multi-sig attestation + Batch 5 testimony challenge / dispute flow.
 * - Flagging with explicit "Suspected synthetic / deceptive deepfake" category.
 * - Steward consensus voting & quorum execution for removals/bans.
 * - AI false-positive appeals stay in audit.js (submitFlagAppeal).
 */

import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  limit,
  getDocs,
  arrayUnion,
  serverTimestamp,
  increment
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { logAuditEvent, logSecurityAudit } from './audit.js';
import { assertStewardAuthority, isHumanSteward } from './rbac.js';

/* ==========================================================================
   CONFIG & CONSTANTS
   ========================================================================== */

export const MINIMUM_MULTISIG_THRESHOLD = 3;
export const DISPUTES_COLLECTION = 'disputes';
export const REPORTS_COLLECTION = 'moderation_reports';
export const TESTIMONIES_COLLECTION = 'testimonies';
export const MIN_CHALLENGE_REASON_LENGTH = 20;
export const QUORUM_REQUIRED = 3; // Minimum steward votes required for consensus

export const REPORT_CATEGORIES = {
  SYNTHETIC_DECEPTIVE: 'suspected_synthetic_deepfake',
  MISINFORMATION: 'misinformation_disinformation',
  VIOLENCE_EXPLICIT: 'violence_graphic_content',
  HARASSMENT: 'harassment_doxxing',
  OTHER: 'other'
};

/* ==========================================================================
   MULTI-SIG ATTESTATION
   ========================================================================== */

/**
 * Submit an attestation signature/proof to a high-stakes testimony multi-sig pool
 */
export async function submitMultiSigAttestation(testimonyId, proofData) {
  if (!auth.currentUser) {
    showToast('You must be logged in to sign multi-sig attestations.', 'error');
    return false;
  }

  try {
    const testimonyRef = doc(db, TESTIMONIES_COLLECTION, testimonyId);

    const attestationRecord = {
      witnessUid: auth.currentUser.uid,
      proofType: proofData.proofType || 'UNKNOWN',
      publicSignalsHash: proofData.publicSignals
        ? proofData.publicSignals[0]
        : proofData.proof?.hash || null,
      isFallback: !!proofData.isFallback,
      signedAt: new Date().toISOString(),
    };

    await updateDoc(testimonyRef, {
      multiSigSignatures: arrayUnion(attestationRecord),
      updatedAt: serverTimestamp(),
    });

    await logSecurityAudit('MULTISIG_ATTESTATION', testimonyId, {
      proofType: attestationRecord.proofType,
    });

    showToast('✅ Multi-Sig attestation anchored to witness pool!', 'success');
    return true;
  } catch (error) {
    console.error('Multi-Sig attestation error:', error);
    showToast('Failed to submit multi-sig attestation.', 'error');
    return false;
  }
}

/**
 * Evaluates whether a testimony has satisfied decentralized consensus thresholds
 */
export function evaluateMultiSigStatus(testimonyData) {
  const signatures = testimonyData?.multiSigSignatures || [];
  const count = signatures.length;

  const hasZkProof = signatures.some((sig) => {
    const type = (sig.proofType || '').toUpperCase();
    return type.includes('GROTH16') || type.includes('ZK');
  });

  const isFullyVerified = count >= MINIMUM_MULTISIG_THRESHOLD && hasZkProof;

  return {
    isFullyVerified,
    signatureCount: count,
    requiredThreshold: MINIMUM_MULTISIG_THRESHOLD,
    hasZkProof,
    status: isFullyVerified ? 'SEALED_HIGH_STAKES' : 'PENDING_WITNESSES',
  };
}

/* ==========================================================================
   BATCH 5 — REPORTING & HUMAN STEWARD REVIEW PANEL
   ========================================================================== */

/**
 * Flag a testimony with a specific report category (e.g. "Suspected synthetic / deceptive deepfake")
 */
export async function reportTestimony(testimonyId, category, reasonDetails = "") {
  const user = auth.currentUser;
  if (!user) {
    showToast("Sign in required to submit a report", "error");
    throw new Error("Unauthenticated");
  }

  if (!Object.values(REPORT_CATEGORIES).includes(category)) {
    showToast("Invalid report category", "error");
    throw new Error("Invalid category");
  }

  // Check for duplicate pending reports by the same user on this testimony
  const existing = await getDocs(query(
    collection(db, REPORTS_COLLECTION),
    where("testimonyId", "==", testimonyId),
    where("reporterId", "==", user.uid),
    where("status", "==", "pending")
  ));

  if (!existing.empty) {
    showToast("You have already reported this content", "info");
    return null;
  }

  const reportData = {
    testimonyId,
    reporterId: user.uid,
    category,
    reasonDetails: reasonDetails.trim().slice(0, 500),
    status: 'pending',
    isSyntheticFlag: category === REPORT_CATEGORIES.SYNTHETIC_DECEPTIVE,
    createdAt: serverTimestamp()
  };

  const docRef = await addDoc(collection(db, REPORTS_COLLECTION), reportData);

  // Route testimony into review queue state
  const testimonyRef = doc(db, TESTIMONIES_COLLECTION, testimonyId);
  await updateDoc(testimonyRef, {
    feedVisibility: 'review_queue',
    moderationStatus: 'pending_steward_review',
    flagCount: increment(1)
  });

  await logAuditEvent({
    testimonyId,
    eventType: 'TESTIMONY_FLAGGED_FOR_REVIEW',
    actionTaken: 'routed_to_steward_queue',
    details: { category, reporterId: user.uid }
  });

  showToast("Report submitted to Human Steward Panel", "success");
  return docRef.id;
}

/**
 * Fetch items queued for moderation review
 */
export async function fetchModerationQueue(max = 20) {
  const q = query(
    collection(db, TESTIMONIES_COLLECTION),
    where("moderationStatus", "==", "pending_steward_review"),
    orderBy("flagCount", "desc"),
    limit(max)
  );

  const snapshot = await getDocs(q);
  return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
}

/**
 * Record a steward's consensus vote on a flagged item.
 * Restricts permanent removal / ban actions strictly to human steward consensus.
 */
export async function submitStewardVote(testimonyId, voteAction, notes = "") {
  const user = auth.currentUser;
  if (!user) throw new Error("Unauthenticated");
  
  // Enforce Steward role check for notifications
  const stewardStatus = await isHumanSteward();
  if (!stewardStatus) {
    showToast("Reviewers can vote; final action requires Steward authority", "info");
  }

  const testimonyRef = doc(db, TESTIMONIES_COLLECTION, testimonyId);
  const testimonySnap = await getDoc(testimonyRef);
  if (!testimonySnap.exists()) throw new Error("Testimony not found");

  const testimony = testimonySnap.data();
  const currentVotes = testimony.stewardVotes || [];

  // Prevent double voting by the same reviewer/steward
  if (currentVotes.some(v => v.stewardId === user.uid)) {
    showToast("You have already recorded your vote on this item", "info");
    return;
  }

  const newVote = {
    stewardId: user.uid,
    action: voteAction, // 'approve_keep', 'label_synthetic', 'remove_content', 'ban_author'
    notes: notes.trim(),
    votedAt: new Date().toISOString()
  };

  const updatedVotes = [...currentVotes, newVote];
  const updatePayload = { stewardVotes: updatedVotes };

  // Calculate quorum consensus
  const removalVotes = updatedVotes.filter(v => v.action === 'remove_content' || v.action === 'ban_author').length;
  const labelVotes = updatedVotes.filter(v => v.action === 'label_synthetic').length;
  const approveVotes = updatedVotes.filter(v => v.action === 'approve_keep').length;

  let decisionReached = null;

  if (removalVotes >= QUORUM_REQUIRED) {
    await assertStewardAuthority(); // Guard restriction: Must be human steward to execute permanent removal
    updatePayload.isDeleted = true;
    updatePayload.moderationStatus = 'removed_by_steward_consensus';
    updatePayload.feedVisibility = 'hidden';
    decisionReached = 'REMOVED_BY_CONSENSUS';
  } else if (labelVotes >= QUORUM_REQUIRED) {
    updatePayload.syntheticLikelihood = 90;
    updatePayload.provenanceStatus = 'steward_labeled_synthetic';
    updatePayload.moderationStatus = 'resolved_labeled';
    updatePayload.feedVisibility = 'public';
    decisionReached = 'LABELED_SYNTHETIC';
  } else if (approveVotes >= QUORUM_REQUIRED) {
    updatePayload.moderationStatus = 'approved_by_steward_consensus';
    updatePayload.feedVisibility = 'public';
    decisionReached = 'APPROVED_PUBLIC';
  }

  await updateDoc(testimonyRef, updatePayload);

  if (decisionReached) {
    await logAuditEvent({
      testimonyId,
      eventType: 'STEWARD_CONSENSUS_DECISION',
      actionTaken: decisionReached,
      details: { removalVotes, labelVotes, approveVotes, totalVotes: updatedVotes.length }
    });
    showToast(`Consensus reached: ${decisionReached}`, "success");
  } else {
    showToast("Vote recorded. Awaiting consensus quorum.", "info");
  }
}

/* ==========================================================================
   BATCH 5 — TESTIMONY CHALLENGE / DISPUTE
   ========================================================================== */

/**
 * Open a challenge against a published testimony.
 * Feeds reputation when resolved (via Cloud Function / tier.js — not client score writes).
 *
 * @param {string} testimonyId
 * @param {string} reason
 * @returns {Promise<string|null>} dispute document id
 */
export async function openTestimonyChallenge(testimonyId, reason) {
  if (!auth.currentUser) {
    showToast('Sign in to challenge a report.', 'error');
    return null;
  }

  if (!testimonyId || typeof testimonyId !== 'string') {
    showToast('Invalid testimony.', 'error');
    return null;
  }

  const reasonClean = (reason || '').trim();
  if (reasonClean.length < MIN_CHALLENGE_REASON_LENGTH) {
    showToast(
      `Please explain the challenge (at least ${MIN_CHALLENGE_REASON_LENGTH} characters).`,
      'error'
    );
    return null;
  }

  try {
    const testimonyRef = doc(db, TESTIMONIES_COLLECTION, testimonyId);
    const testimonySnap = await getDoc(testimonyRef);

    if (!testimonySnap.exists()) {
      showToast('Testimony not found.', 'error');
      return null;
    }

    const tData = testimonySnap.data();
    if (tData.authorId && tData.authorId === auth.currentUser.uid) {
      showToast('You cannot challenge your own report.', 'error');
      return null;
    }

    const disputeDoc = {
      type: 'TESTIMONY_CHALLENGE',
      testimonyId,
      testimonyAuthorId: tData.authorId || null,
      challengerId: auth.currentUser.uid,
      reason: reasonClean,
      status: 'OPEN',
      resolution: null,
      resolutionNote: null,
      resolvedBy: null,
      createdAt: serverTimestamp(),
      createdAtClient: Date.now(),
      resolvedAt: null,
    };

    const ref = await addDoc(collection(db, DISPUTES_COLLECTION), disputeDoc);

    await logSecurityAudit('TESTIMONY_CHALLENGE_OPENED', testimonyId, {
      disputeId: ref.id,
      challengerId: auth.currentUser.uid,
    });

    showToast('Challenge submitted for review.', 'success');
    return ref.id;
  } catch (error) {
    console.error('openTestimonyChallenge error:', error);
    showToast('Failed to submit challenge.', 'error');
    return null;
  }
}

/**
 * Resolve a testimony challenge.
 * Restrict via Firestore rules + admin claim, or call only from Cloud Functions.
 *
 * @param {string} disputeId
 * @param {'UPHELD'|'REJECTED'} resolution
 * @param {string} [note]
 * @returns {Promise<boolean>}
 */
export async function resolveTestimonyChallenge(
  disputeId,
  resolution,
  note = ''
) {
  if (!auth.currentUser) {
    showToast('Sign in required.', 'error');
    return false;
  }

  if (!['UPHELD', 'REJECTED'].includes(resolution)) {
    showToast('Invalid resolution.', 'error');
    return false;
  }

  try {
    const disputeRef = doc(db, DISPUTES_COLLECTION, disputeId);
    const snap = await getDoc(disputeRef);

    if (!snap.exists()) {
      showToast('Dispute not found.', 'error');
      return false;
    }

    const data = snap.data();
    if (data.status !== 'OPEN' && data.status !== 'PENDING') {
      showToast('Dispute already resolved.', 'error');
      return false;
    }

    const status = resolution === 'UPHELD' ? 'UPHELD' : 'REJECTED';

    await updateDoc(disputeRef, {
      status,
      resolution,
      resolutionNote: (note || '').trim() || null,
      resolvedAt: serverTimestamp(),
      resolvedBy: auth.currentUser.uid,
    });

    await logSecurityAudit('TESTIMONY_CHALLENGE_RESOLVED', data.testimonyId, {
      disputeId,
      resolution,
      testimonyAuthorId: data.testimonyAuthorId || null,
      challengerId: data.challengerId || null,
    });

    showToast(`Dispute marked ${resolution}.`, 'success');
    return true;
  } catch (error) {
    console.error('resolveTestimonyChallenge error:', error);
    showToast('Failed to resolve dispute.', 'error');
    return false;
  }
}

/**
 * List recent disputes for transparency dashboard.
 * @param {number} limitCount
 * @returns {Promise<Array<object>>}
 */
export async function listRecentDisputes(limitCount = 25) {
  try {
    const q = query(
      collection(db, DISPUTES_COLLECTION),
      orderBy('createdAtClient', 'desc'),
      limit(limitCount)
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (e) {
    console.warn('listRecentDisputes ordered query failed, fallback:', e);
    try {
      const snapshot = await getDocs(
        query(collection(db, DISPUTES_COLLECTION), limit(limitCount))
      );
      const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      return docs.sort(
        (a, b) => (b.createdAtClient || 0) - (a.createdAtClient || 0)
      );
    } catch (e2) {
      console.error('listRecentDisputes failed:', e2);
      return [];
    }
  }
}

/**
 * Count dispute outcomes.
 */
export async function getDisputeOutcomeCounts(limitCount = 200) {
  const rows = await listRecentDisputes(limitCount);
  return {
    open: rows.filter((x) => x.status === 'OPEN' || x.status === 'PENDING').length,
    upheld: rows.filter((x) => x.status === 'UPHELD' || x.resolution === 'UPHELD').length,
    rejected: rows.filter((x) => x.status === 'REJECTED' || x.resolution === 'REJECTED').length,
    total: rows.length,
  };
}

/* ==========================================================================
   WINDOW BINDINGS FOR INLINE HANDLERS & LEGACY SCRIPTS
   ========================================================================== */

if (typeof window !== 'undefined') {
  window.submitMultiSigAttestation = submitMultiSigAttestation;
  window.evaluateMultiSigStatus = evaluateMultiSigStatus;
  window.reportTestimony = reportTestimony;
  window.fetchModerationQueue = fetchModerationQueue;
  window.submitStewardVote = submitStewardVote;
  window.openTestimonyChallenge = openTestimonyChallenge;
  window.resolveTestimonyChallenge = resolveTestimonyChallenge;
  window.listRecentDisputes = listRecentDisputes;
  window.getDisputeOutcomeCounts = getDisputeOutcomeCounts;
}
