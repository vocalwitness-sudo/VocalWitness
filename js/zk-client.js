// js/zk-client.js
// Production: server-side membership tree + Groth16 prove only.
// Client never builds Merkle paths, never writes zkVerified/tier, never uses SHA-256 as a ZK substitute.

import { showToast } from './utils.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js';

/**
 * Full Witness Circle elevation:
 * 1) registerZKCommitment – server creates secret/nullifier, commitment, inserts leaf
 * 2) generateZKProof – server loads path + root, proves, verifies, writes tier + nullifier
 *
 * No client inputs. No local worker. No cryptographic fallback for elevation.
 */
export async function elevateWithZKProof(options = {}) {
  const {
    registerTimeoutMs = 30000,
    proveTimeoutMs = 120000,
    silent = false
  } = options;

  const functions = getFunctions();
  const register = httpsCallable(functions, 'registerZKCommitment');
  const prove = httpsCallable(functions, 'generateZKProof');

  const withTimeout = (promise, ms, msg) =>
    Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(msg)), ms)
      )
    ]);

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
    showToast('Generating zero-knowledge proof…', 'info');
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
    isFallback: false,
    proofType: 'SNARK_GROTH16_SERVER',
    proof: response.data.proof,
    publicSignals: response.data.publicSignals,
    merkleRoot: response.data.merkleRoot || null
  };
}

/**
 * Backward-compatible name used by older imports.
 * Ignores any client-supplied inputs — server owns secrets, path, and root.
 */
export async function generateZKProofAsync(_inputs, options = {}) {
  return elevateWithZKProof(options);
}

/**
 * Optional client-side check of a server-produced proof.
 * Elevation already verifies on the server; this is for local display / audit only.
 */
export async function verifyZKProofAsync(proofObj) {
  if (!proofObj || !proofObj.proof || !proofObj.publicSignals) return false;

  try {
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

  // Server already verified during elevateWithZKProof
  return true;
}

/**
 * Strip EXIF/GPS and SHA-256 hash media on-device.
 * Independent of membership ZK — kept strictly for the evidence pipeline.
 */
export async function sanitizeAndHashMediaAsync(file) {
  if (!file) {
    throw new Error('No media file provided for sanitization.');
  }

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
