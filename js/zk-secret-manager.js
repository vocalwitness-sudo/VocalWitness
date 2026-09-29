/**
 * js/zk-secret-manager.js
 * Deterministic ZK identity from Firebase Auth UID.
 */
import { auth } from './firebase-config.js';

const DOMAIN_SALT = 'VocalWitness_Deterministic_Salt_2026';
const SESSION_PREFIX = 'vw_zk_';

export async function getOrCreateDeterministicZKIdentity() {
  const user = auth?.currentUser;
  if (!user?.uid) {
    throw new Error('User must be authenticated to derive ZK identity.');
  }

  const uid = user.uid;
  const cacheSecretKey = `${SESSION_PREFIX}secret_${uid}`;
  const cacheNullifierKey = `${SESSION_PREFIX}nullifier_${uid}`;

  const cachedSecret = sessionStorage.getItem(cacheSecretKey);
  const cachedNullifier = sessionStorage.getItem(cacheNullifierKey);
  if (cachedSecret && cachedNullifier) {
    return { secret: cachedSecret, nullifier: cachedNullifier };
  }

  const seedString = `${DOMAIN_SALT}_${uid}`;
  const data = new TextEncoder().encode(seedString);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));

  const secretHex = hashArray.slice(0, 16).map(b => b.toString(16).padStart(2, '0')).join('');
  const nullifierHex = hashArray.slice(16, 32).map(b => b.toString(16).padStart(2, '0')).join('');

  const secret = BigInt('0x' + secretHex).toString();
  const nullifier = BigInt('0x' + nullifierHex).toString();

  try {
    sessionStorage.setItem(cacheSecretKey, secret);
    sessionStorage.setItem(cacheNullifierKey, nullifier);
  } catch (_) {}

  return { secret, nullifier };
}

export async function buildCircuitInputs(publicConfig = {}, userData = {}) {
  const { secret, nullifier } = await getOrCreateDeterministicZKIdentity();
  return {
    secret,
    nullifier,
    trustScore: String(userData.trustScore ?? 0),
    postCount: String(userData.postCount ?? 0),
    pathElements: userData.pathElements || Array(8).fill('0'),
    pathIndices: userData.pathIndices || Array(8).fill(0),
    merkleRoot: String(publicConfig.merkleRoot ?? '0'),
    minTrustScore: String(publicConfig.minTrustScore ?? '50'),
    minPosts: String(publicConfig.minPosts ?? '1'),
    context: userData.context != null ? String(userData.context) : '0',
  };
}

export function clearZkSessionCache() {
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(SESSION_PREFIX)) keys.push(k);
    }
    keys.forEach(k => sessionStorage.removeItem(k));
  } catch (_) {}
}

/** Used by auth.js onAuthStateChanged */
export function onAuthStateChangedForZk(user) {
  if (!user) clearZkSessionCache();
}

if (typeof window !== 'undefined') {
  window.VW_ZK = {
    getOrCreateDeterministicZKIdentity,
    buildCircuitInputs,
    clearZkSessionCache,
    onAuthStateChangedForZk,
  };
}
