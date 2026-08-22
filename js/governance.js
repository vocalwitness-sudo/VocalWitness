// js/governance.js - Decentralized Multi-Sig Attestation & High-Stakes Witness Pool

import { doc, updateDoc, arrayUnion, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";
import { showToast } from "./utils.js";

export const MINIMUM_MULTISIG_THRESHOLD = 3;

/**
 * Submit an attestation signature/proof to a high-stakes testimony multi-sig pool
 */
export async function submitMultiSigAttestation(testimonyId, proofData) {
  if (!auth.currentUser) {
    showToast("You must be logged in to sign multi-sig attestations.", "error");
    return false;
  }

  try {
    const testimonyRef = doc(db, "testimonies", testimonyId);
    
    const attestationRecord = {
      witnessUid: auth.currentUser.uid,
      proofType: proofData.proofType || "UNKNOWN",
      publicSignalsHash: proofData.publicSignals ? proofData.publicSignals[0] : (proofData.proof?.hash || null),
      isFallback: !!proofData.isFallback,
      signedAt: new Date().toISOString()
    };

    await updateDoc(testimonyRef, {
      multiSigSignatures: arrayUnion(attestationRecord),
      updatedAt: serverTimestamp()
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
 * Evaluates whether a testimony has satisfied decentralized consensus thresholds
 */
export function evaluateMultiSigStatus(testimonyData) {
  const signatures = testimonyData?.multiSigSignatures || [];
  const count = signatures.length;
  
  const hasZkProof = signatures.some(sig => sig.proofType === "SNARK_GROTH16" || sig.proofType === "SNARK_GROTH16_SERVER");

  return {
    isFullyVerified: count >= MINIMUM_MULTISIG_THRESHOLD && hasZkProof,
    signatureCount: count,
    requiredThreshold: MINIMUM_MULTISIG_THRESHOLD,
    hasZkProof,
    status: count >= MINIMUM_MULTISIG_THRESHOLD && hasZkProof ? "SEALED_HIGH_STAKES" : "PENDING_WITNESSES"
  };
}

// Global Window Exports for Legacy script support
window.submitMultiSigAttestation = submitMultiSigAttestation;
window.evaluateMultiSigStatus = evaluateMultiSigStatus;
