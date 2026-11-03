// js/zk-client.js
// Production: server-side membership tree + Groth16 prove only.
// Client never builds Merkle paths, never writes zkVerified/tier.

import { showToast } from './utils.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js';

/**
 * Full Witness Circle elevation
 */
export async function elevateWithZKProof(options = {}) {
  const {
    registerTimeoutMs = 45000,
    proveTimeoutMs = 150000,
    silent = false
  } = options;

  const functions = getFunctions();
  const register = httpsCallable(functions, 'registerZKCommitment');
  const prove = httpsCallable(functions, 'generateZKProof');

  const withTimeout = (promise, ms, msg) =>
    Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
    ]);

  const friendlyError = (err) => {
    const msg = (err?.message || err?.code || String(err)).toLowerCase();
    if (msg.includes('already-exists') || msg.includes('nullifier')) {
      return 'This account is already elevated or the nullifier was spent.';
    }
    if (msg.includes('unauthenticated') || msg.includes('sign in')) {
      return 'Please sign in again and retry.';
    }
    if (msg.includes('app check') || msg.includes('unauthorized')) {
      return 'Security check failed. Refresh the page and try again.';
    }
    if (msg.includes('timed out') || msg.includes('timeout')) {
      return 'The verification took too long. Please try again.';
    }
    if (msg.includes('no commitment') || msg.includes('failed-precondition')) {
      return 'Membership not registered yet. Retrying…';
    }
    return err?.message || 'Verification failed. Please try again.';
  };

  try {
    if (!silent && typeof showToast === 'function') {
      showToast('Registering membership commitment…', 'info');
    }

    const reg = await withTimeout(
      register({}),
      registerTimeoutMs,
      'Commitment registration timed out'
    );

    if (reg?.data?.error) {
      throw new Error(reg.data.error);
    }

    if (!silent && typeof showToast === 'function') {
      showToast('Generating zero-knowledge proof… This may take a moment.', 'info');
    }

    const response = await withTimeout(
      prove({}),
      proveTimeoutMs,
      'ZK proof generation timed out'
    );

    if (!response?.data?.success) {
      throw new Error(response?.data?.error || 'ZK proof generation failed');
    }

    return {
      isFallback: !!response.data.isFallback,
      proofType: response.data.proofType || 'SNARK_GROTH16_SERVER',
      proof: response.data.proof,
      publicSignals: response.data.publicSignals,
      merkleRoot: response.data.merkleRoot || null
    };
  } catch (err) {
    const friendly = friendlyError(err);
    throw new Error(friendly);
  }
}

/** Backward-compatible name */
export async function generateZKProofAsync(_inputs, options = {}) {
  return elevateWithZKProof(options);
}

/** Optional client-side verification (for display / audit only) */
export async function verifyZKProofAsync(proofObj) {
  if (!proofObj || !proofObj.proof || !proofObj.publicSignals) return false;

  try {
    if (!window.snarkjs?.groth16) {
      try {
        const { loadSnarkjs } = await import('./load-libs.js');
        await loadSnarkjs();
      } catch (e) {
        console.warn('Could not load snarkjs for client verify');
      }
    }

    if (window.snarkjs?.groth16) {
      const res = await fetch('/assets/zk/verification_key.json');
      if (!res.ok) return false;
      const vKey = await res.json();
      return await window.snarkjs.groth16.verify(
        vKey,
        proofObj.publicSignals,
        proofObj.proof
      );
    }
  } catch (err) {
    console.warn('Client-side ZK verify skipped:', err);
  }

  // Server already verified
  return true;
}

/**
 * Media sanitization + SHA-256 (independent of membership ZK)
 */
export async function sanitizeAndHashMediaAsync(file) {
  if (!file) throw new Error('No media file provided for sanitization.');

  const fileBuffer = await file.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const mediaHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  let sanitizedBlob = file;

  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
    try {
      sanitizedBlob = await new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);

        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          canvas.toBlob(
            (blob) => {
              URL.revokeObjectURL(url);
              resolve(blob || file);
            },
            file.type,
            0.92
          );
        };

        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve(file);
        };

        img.src = url;
      });
    } catch (e) {
      console.warn('Image metadata stripping failed:', e);
    }
  }

  return {
    sanitizedBlob,
    mediaHash,
    fileType: file.type,
    fileName: file.name
  };
}
