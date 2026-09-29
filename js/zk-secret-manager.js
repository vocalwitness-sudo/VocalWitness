// js/zk-secret-manager.js
import { auth } from './auth.js'; // Adjust path to your Firebase auth export if needed

/**
 * Deterministically derives or retrieves the user's ZK secret and nullifier 
 * using their Firebase Auth UID so they never lose their identity if they switch devices.
 */
export async function getOrCreateDeterministicZKIdentity() {
  const user = auth.currentUser;
  if (!user) {
    throw new Error("User must be authenticated to derive ZK identity.");
  }

  // Check sessionStorage first so we don't re-derive repeatedly in the same session
  const cachedSecret = sessionStorage.getItem(`vw_zk_secret_${user.uid}`);
  const cachedNullifier = sessionStorage.getItem(`vw_zk_secret_nullifier_${user.uid}`);

  if (cachedSecret && cachedNullifier) {
    return {
      secret: cachedSecret,
      nullifier: cachedNullifier
    };
  }

  // Use a deterministic seed source combining UID and a static domain salt
  // This ensures the same user always generates the exact same secret & nullifier
  const seedString = `VocalWitness_Deterministic_Salt_${user.uid}_2026`;
  
  // Use Web Crypto API (SHA-256) to derive pseudo-random big numbers deterministically
  const encoder = new TextEncoder();
  const data = encoder.encode(seedString);
  
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  
  // Split hash into two parts for secret and nullifier
  const secretHex = hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  const nullifierHex = hashArray.slice(16, 32).map(b => b.toString(16).padStart(2, '0')).join('');

  // Convert hex to large decimal strings required by Circom/Poseidon
  const secret = BigInt('0x' + secretHex).toString();
  const nullifier = BigInt('0x' + nullifierHex).toString();

  // Cache in session storage (never written to unencrypted long-term storage like plain localStorage)
  sessionStorage.setItem(`vw_zk_secret_${user.uid}`, secret);
  sessionStorage.setItem(`vw_zk_secret_nullifier_${user.uid}`, nullifier);

  return { secret, nullifier };
}

/**
 * Builds the complete set of inputs required by witness.circom
 * 
 * @param {Object} publicConfig - { merkleRoot, minTrustScore, minPosts }
 * @param {Object} userData - { trustScore, postCount, pathElements, pathIndices, context }
 */
export async function buildCircuitInputs(publicConfig, userData) {
  const { secret, nullifier } = await getOrCreateDeterministicZKIdentity();

  return {
    // Private inputs matching witness.circom
    secret: secret,
    nullifier: nullifier,
    trustScore: String(userData.trustScore || 0),
    postCount: String(userData.postCount || 0),
    pathElements: userData.pathElements || Array(8).fill("0"),
    pathIndices: userData.pathIndices || Array(8).fill(0),

    // Public inputs matching witness.circom
    merkleRoot: String(publicConfig.merkleRoot || "0"),
    minTrustScore: String(publicConfig.minTrustScore || "50"),
    minPosts: String(publicConfig.minPosts || "1"),

    // Optional context salt if needed for action-specific nullifiers
    context: userData.context || "0"
  };
}
