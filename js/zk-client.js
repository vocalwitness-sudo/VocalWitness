// js/zk-client.js - ZK Proof Engine with Cryptographic Fallback & Memory Guard
import { showToast } from './utils.js';

/**
 * Generates standard signature fallback when ZK WASM fails, times out, or OOMs
 */
async function generateFallbackSignature(inputs) {
    if (typeof showToast === 'function') {
        showToast('Falling back to standard cryptographic signature...', 'warning');
    }
    
    // Check if wallet provider is present
    if (window.ethereum && window.ethers) {
        try {
            const ethersLib = window.ethers;
            let signer;
            if (ethersLib.BrowserProvider) {
                const provider = new ethersLib.BrowserProvider(window.ethereum);
                signer = await provider.getSigner();
            } else if (ethersLib.providers?.Web3Provider) {
                const provider = new ethersLib.providers.Web3Provider(window.ethereum);
                signer = provider.getSigner();
            }

            if (signer) {
                const message = JSON.stringify(inputs);
                const signature = await signer.signMessage(message);

                return {
                    isFallback: true,
                    proofType: 'ECDSA_SIGNATURE',
                    proof: { signature },
                    publicSignals: [await signer.getAddress()]
                };
            }
        } catch (err) {
            console.warn("Wallet signing fallback rejected:", err);
        }
    }

    // SHA-256 fallback stamp
    const randomSalt = crypto.getRandomValues(new Uint8Array(16));
    const payload = JSON.stringify(inputs) + Date.now() + Array.from(randomSalt).join('');
    
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(payload));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return {
        isFallback: true,
        proofType: 'CLIENT_SHA256_STAMP',
        proof: { hash: hashHex },
        publicSignals: [hashHex]
    };
}

/**
 * Main proof entry point with hardware & runtime bounds
 */
export async function generateZKProofAsync(inputs) {
    // 1. Hardware Pre-Check (<2GB RAM)
    if (navigator.deviceMemory && navigator.deviceMemory < 2) {
        console.warn("Low memory environment detected (<2GB). Bypassing ZK WASM.");
        return await generateFallbackSignature(inputs);
    }

    // 2. Worker Capability Guard
    if (!window.Worker) {
        if (typeof showToast === 'function') {
            showToast("Web Workers not supported. Using standard cryptographic fallback.", 'warning');
        }
        return await generateFallbackSignature(inputs);
    }

    // 3. Delegate execution to ZK Web Worker
    return new Promise((resolve, reject) => {
        let worker;
        try {
            worker = new Worker(new URL('./zk-worker.js', import.meta.url), { type: 'module' });
        } catch (e) {
            console.warn("Failed to construct module ZK Worker. Triggering fallback...", e);
            return generateFallbackSignature(inputs).then(resolve).catch(reject);
        }

        const timeout = setTimeout(async () => {
            cleanup();
            if (typeof showToast === 'function') {
                showToast("ZK proof generation timed out. Executing cryptographic fallback...", 'warning');
            }
            try {
                const fallbackResult = await generateFallbackSignature(inputs);
                resolve(fallbackResult);
            } catch (fallbackErr) {
                reject(new Error("ZK proof generation timed out and fallback failed."));
            }
        }, 45000);

        const unloadHandler = () => cleanup();

        const cleanup = () => {
            clearTimeout(timeout);
            window.removeEventListener('beforeunload', unloadHandler);
            if (worker) {
                worker.terminate();
            }
        };

        window.addEventListener('beforeunload', unloadHandler, { once: true });

        worker.onmessage = async (e) => {
            const { success, proof, publicSignals, error, note, type } = e.data;

            if (type === 'STATUS_UPDATE') {
                return; // Ignore status update messages during processing
            }

            cleanup();

            if (success) {
                if (note && typeof showToast === 'function') {
                    showToast(note, 'info');
                }
                resolve({ isFallback: false, proofType: 'SNARK_GROTH16', proof, publicSignals });
            } else {
                console.warn("Worker execution returned failure status. Triggering fallback:", error);
                generateFallbackSignature(inputs).then(resolve).catch(reject);
            }
        };

        worker.onerror = async (err) => {
            cleanup();
            console.error("ZK Worker execution crashed (likely WASM OOM):", err);
            try {
                const fallbackResult = await generateFallbackSignature(inputs);
                resolve(fallbackResult);
            } catch (fallbackErr) {
                reject(new Error(err.message || "Failed to execute ZK worker script."));
            }
        };

        worker.postMessage(inputs);
    });
}
