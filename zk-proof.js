// js/zk-proof.js - Main Thread Manager
import { showToast } from './utils.js';

let zkCapabilityCache = null;

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

export async function generateWitnessProof(proofPayload, options = {}) {
    const profile = getZKEnvironmentProfile();

    return new Promise((resolve, reject) => {
        // Spawns the SEPARATE worker file
        const worker = new Worker('/js/zk-worker.js', { type: 'module' });

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
            reject(error);
        };

        worker.postMessage({
            ...proofPayload,
            useMock: options.useMock || false,
            threads: profile.recommendedThreads,
            canMultithread: profile.canMultithread
        });
    });
}

if (typeof window !== 'undefined') {
    window.getZKEnvironmentProfile = getZKEnvironmentProfile;
    window.generateWitnessProof = generateWitnessProof;
}
