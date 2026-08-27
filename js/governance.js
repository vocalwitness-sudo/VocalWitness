/**
 * js/governance.js
 * Multi-sig attestation + Batch 5 testimony challenge / dispute flow.
 * AI false-positive appeals stay in audit.js (submitFlagAppeal).
 */

import {
  doc,
  getDoc,
  updateDoc,
  addDoc,
  collection,
  query,
  orderBy,
  limit,
  getDocs,
  arrayUnion,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { logSecurityAudit } from './audit.js';

export const MINIMUM_MULTISIG_THRESHOLD = 3;
export const DISPUTES_COLLECTION = 'disputes';
export const MIN_CHALLENGE_REASON_LENGTH = 20;

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
    const testimonyRef = doc(db, 'testimonies', testimonyId);

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
    const testimonyRef = doc(db, 'testimonies', testimonyId);
    const testimonySnap = await getDoc(testimonyRef);

    if (!testimonySnap.exists()) {
      showToast('Testimony not found.', 'error');
      return null;
    }

    const tData = testimonySnap.data();
    if (tData.authorId && tData.authorId === auth.currentUser.uid) {
      showToast('You cannot challenge your own report.', 'error');
      return null; // Fixed: returned null instead of false
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
      // Client-side sort fallback if composite index is missing
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
    open: rows.filter((x) => x.status === 'OPEN' || x.status === 'PENDING')
      .length,
    upheld: rows.filter(
      (x) => x.status === 'UPHELD' || x.resolution === 'UPHELD'
    ).length,
    rejected: rows.filter(
      (x) => x.status === 'REJECTED' || x.resolution === 'REJECTED'
    ).length,
    total: rows.length,
  };
}

// Window exports for inline handlers
if (typeof window !== 'undefined') {
  window.submitMultiSigAttestation = submitMultiSigAttestation;
  window.evaluateMultiSigStatus = evaluateMultiSigStatus;
  window.openTestimonyChallenge = openTestimonyChallenge;
  window.resolveTestimonyChallenge = resolveTestimonyChallenge;
  window.listRecentDisputes = listRecentDisputes;
  window.getDisputeOutcomeCounts = getDisputeOutcomeCounts;
}
