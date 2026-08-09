/**
 * VocalWitness ZK Cryptography Engine (js/zk-crypto.js)
 * Manages zero-knowledge proof generation, hardware detection,
 * and multi-threading capabilities based on Cross-Origin Isolation status.
 */

import { showToast } from './utils.js';

// Cache thread capability status
let zkCapabilityCache = null;

/**
 * Inspects system capabilities to determine if hardware acceleration 
 * and SharedArrayBuffer multithreading are available.
 * 
 * @returns {Object} Environment capability profile
 */
export function getZKEnvironmentProfile() {
    if (zkCapabilityCache) return zkCapabilityCache;

    const isIsolated = typeof self !== 'undefined' && Boolean(self.crossOriginIsolated);
    const hasSAB = typeof SharedArrayBuffer !== 'undefined';
    const hardwareConcurrency = (navigator && navigator.hardwareConcurrency) || 2;
    const deviceMemory = (navigator && navigator.deviceMemory) || 2;

    // Multi-threading requires both Cross-Origin Isolation (COOP/COEP) and SharedArrayBuffer
    const canMultithread = isIsolated && hasSAB && hardwareConcurrency > 1;

    // Optimal worker count calculation
    const recommendedThreads = canMultithread 
        ? Math.max(1, Math.min(hardwareConcurrency - 1, 4)) 
        : 1;

    zkCapabilityCache = {
        crossOriginIsolated: isIsolated,
        hasSharedArrayBuffer: hasSAB,
        canMultithread,
        recommendedThreads,
        hardwareConcurrency,
        deviceMemory,
        isLowEndDevice: deviceMemory < 4 || hardwareConcurrency < 4
    };

    console.log('[ZK Crypto Engine] Performance Profile initialized:', zkCapabilityCache);
    return zkCapabilityCache;
}

/**
 * Initializes and dispatches ZK proof generation to the worker thread.
 * 
 * @param {Object} proofPayload Secret inputs, nullifiers, and commitments
 * @param {Object} options Configuration flags (e.g. useMock)
 * @returns {Promise<Object>} Proof and public signals
 */
export async function generateWitnessProof(proofPayload, options = {}) {
    const profile = getZKEnvironmentProfile();

    if (!profile.crossOriginIsolated && !options.useMock) {
        console.warn('[ZK Crypto Engine] Warning: Site is not Cross-Origin Isolated. ZK proof will execute in single-threaded fallback mode.');
    }

    return new Promise((resolve, reject) => {
        const worker = new Worker('/js/zk-worker.js');

        const timeoutMs = profile.isLowEndDevice ? 60000 : 30000;
        const timeoutHandler = setTimeout(() => {
            worker.terminate();
            reject(new Error(`ZK Proof generation timed out after ${timeoutMs / 1000}s.`));
        }, timeoutMs);

        worker.onmessage = (event) => {
            const data = event.data;

            if (data.type === 'STATUS_UPDATE') {
                console.log(`[ZK Worker Status]: ${data.message}`);
                return;
            }

            // Proof generation complete
            clearTimeout(timeoutHandler);
            worker.terminate();

            if (data.success) {
                resolve({
                    proof: data.proof,
                    publicSignals: data.publicSignals,
                    note: data.note || null,
                    multithreaded: profile.canMultithread
                });
            } else {
                reject(new Error(data.error || 'Failed to generate ZK proof.'));
            }
        };

        worker.onerror = (error) => {
            clearTimeout(timeoutHandler);
            worker.terminate();
            console.error('[ZK Worker Fatal Execution Error]:', error);
            reject(error);
        };

        // Dispatch job to worker with capability flags
        worker.postMessage({
            ...proofPayload,
            useMock: options.useMock || false,
            threads: profile.recommendedThreads,
            canMultithread: profile.canMultithread
        });
    });
}

/**
 * Verifies a SnarkJS Groth16 proof against public signals and vkey JSON.
 * 
 * @param {Object} verificationKey Parsed JSON verification key
 * @param {Array} publicSignals Public signal array
 * @param {Object} proof Groth16 proof object
 * @returns {Promise<boolean>} True if valid, false otherwise
 */
export async function verifyWitnessProof(verificationKey, publicSignals, proof) {
    if (!verificationKey || !publicSignals || !proof) {
        throw new Error("Missing arguments for proof verification.");
    }

    // Handle mock proofs early
    if (proof.pi_a && proof.pi_a[0] === 'mock_a') {
        console.warn("⚠️ Mock proof submitted for verification — auto-passed for dev environment.");
        return true;
    }

    try {
        if (typeof snarkjs === 'undefined') {
            throw new Error("SnarkJS library not loaded in main thread window context.");
        }

        const isValid = await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
        return isValid;
    } catch (err) {
        console.error("[ZK Crypto Engine] Verification error:", err);
        return false;
    }
}

// Auto-register capabilities on module load
if (typeof window !== 'undefined') {
    window.getZKEnvironmentProfile = getZKEnvironmentProfile;
    window.generateWitnessProof = generateWitnessProof;
    window.verifyWitnessProof = verifyWitnessProof;
}
