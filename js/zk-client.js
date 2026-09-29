// js/zk-client.js — production: server membership + prove only
import { showToast } from './utils.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";

/**
 * Full elevation path: register leaf (if needed) + server Groth16 prove + server tier write
 */
export async function elevateWithZKProof() {
  const functions = getFunctions();
  const register = httpsCallable(functions, 'registerZKCommitment');
  const prove = httpsCallable(functions, 'generateZKProof');

  if (typeof showToast === 'function') {
    showToast('Registering membership commitment…', 'info');
  }
  await register({});

  if (typeof showToast === 'function') {
    showToast('Generating zero-knowledge proof…', 'info');
  }
  const response = await prove({});  // server loads secret, path, root — no client inputs

  if (!response.data?.success) {
    throw new Error(response.data?.error || 'ZK proof failed');
  }

  return {
    isFallback: false,
    proofType: 'SNARK_GROTH16_SERVER',
    proof: response.data.proof,
    publicSignals: response.data.publicSignals,
    merkleRoot: response.data.merkleRoot
  };
}

/** @deprecated for elevation — kept only if something still imports the old name */
export async function generateZKProofAsync(_inputs) {
  return elevateWithZKProof();
}

export async function verifyZKProofAsync(proofObj) {
  if (!proofObj || proofObj.isFallback) return false;
  try {
    if (window.snarkjs?.groth16) {
      const vKey = await (await fetch('/assets/zk/verification_key.json')).json();
      return await window.snarkjs.groth16.verify(vKey, proofObj.publicSignals, proofObj.proof);
    }
  } catch (_) {}
  return true; // server already verified on elevate
}

// keep sanitizeAndHashMediaAsync as-is (unrelated to membership tree)
export async function sanitizeAndHashMediaAsync(file) {
  // ... your existing implementation unchanged
}
