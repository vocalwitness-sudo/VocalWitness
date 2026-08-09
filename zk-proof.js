// js/zk-proof.js - Main Thread ZK Proof Manager
import { showToast } from './utils.js';

let zkCapabilityCache = null;

/**
 * Detects system capabilities for zero-knowledge proof generation,
 * including multithreading support via Cross-Origin Isolation.
 */
export function getZKEnvironmentProfile() {
    if (zkCapabilityCache) return zkCapabilityCache;

    const isIsolated = typeof self !== 'undefined' && Boolean(self.crossOriginIsolated);
    const hasSAB = typeof SharedArrayBuffer !== 'undefined';
    const hardwareConcurrency = (typeof navigator !== 'undefined' && navigator.hardwareConcurrency) || 2;
    const deviceMemory = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 2;

    const canMultithread = isIsolated && hasSAB && hardwareConcurrency > 1;
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

    return zkCapabilityCache;
}

/**
 * Spawns the dedicated Web Worker to generate SnarkJS Groth16 proofs off the main thread.
 * 
 * @param {Object} proofPayload - Data inputs required by the circuit.
 * @param {Object} options - Configuration parameters (e.g. useMock).
 * @returns {Promise<{proof: Object, publicSignals: Array, note: string|null, multithreaded: boolean}>}
 */
export async function generateWitnessProof(proofPayload, options = {}) {
    const profile = getZKEnvironmentProfile();

    return new Promise((resolve, reject) => {
        // Resolve worker path dynamically relative to this module
        // Note: Omit { type: 'module' } so importScripts works inside zk-worker.js
        const workerUrl = new URL('./zk-worker.js', import.meta.url);
        const worker = new Worker(workerUrl);

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
            console.error('[ZK Worker Error]:', error);
            reject(new Error(error.message || 'Error executing ZK worker script.'));
        };

        worker.postMessage({
            ...proofPayload,
            useMock: options.useMock || false,
            threads: profile.recommendedThreads,
            canMultithread: profile.canMultithread
        });
    });
}

/**
 * Verifies a generated Groth16 proof against the verification key on the main thread.
 * 
 * @param {Object} verificationKey - The JSON verification key object.
 * @param {Array} publicSignals - Public parameters generated during proof creation.
 * @param {Object} proof - The Groth16 proof object.
 * @returns {Promise<boolean>}
 */
export async function verifyWitnessProof(verificationKey, publicSignals, proof) {
    if (typeof snarkjs === 'undefined') {
        throw new Error("SnarkJS global library is not loaded on main thread.");
    }
    return await snarkjs.groth16.verify(verificationKey, publicSignals, proof);
}

// Global window bindings for non-module integration
if (typeof window !== 'undefined') {
    window.getZKEnvironmentProfile = getZKEnvironmentProfile;
    window.generateWitnessProof = generateWitnessProof;
    window.verifyWitnessProof = verifyWitnessProof;
}
