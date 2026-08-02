// js/zk-client.js - ZK Proof Engine with Cryptographic Fallback & Memory Guard
import { showToast } from './utils.js';

/**
 * Generates standard signature fallback when ZK WASM fails or OOMs
 */
async function generateFallbackSignature(inputs) {
    if (typeof showToast === 'function') {
        showToast('Falling back to standard cryptographic signature...', 'warning');
    }
    
    // Check if ethers or Web3 wallet is available
    if (window.ethereum && window.ethers) {
        try {
            const provider = new window.ethers.providers.Web3Provider(window.ethereum);
            const signer = provider.getSigner();
            const message = JSON.stringify(inputs);
            const signature = await signer.signMessage(message);

            return {
                isFallback: true,
                proofType: 'ECDSA_SIGNATURE',
                proof: { signature },
                publicSignals: [await signer.getAddress()]
            };
        } catch (err) {
            console.warn("Wallet signing fallback rejected:", err);
        }
    }

    // Secondary fallback: Return plain SHA-256 hash payload with timestamp
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(inputs) + Date.now());
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return {
        isFallback: true,
        proofType: 'CLIENT_SHA256_STAMP',
        proof: { hash: hashHex },
        publicSignals: [hashHex]
    };
}

export function generateZKProofAsync(inputs) {
    return new Promise(async (resolve, reject) => {
        // 1. Hardware & Memory Guard Pre-Check (<2GB RAM)
        if (navigator.deviceMemory && navigator.deviceMemory < 2) {
            console.warn("Low memory environment detected (<2GB). Bypassing ZK WASM to prevent OOM crash.");
            try {
                const fallbackResult = await generateFallbackSignature(inputs);
                return resolve(fallbackResult);
            } catch (err) {
                return reject(err);
            }
        }

        // 2. Worker Capability Guard
        if (!window.Worker) {
            const errorMsg = "Web Workers not supported. Using standard cryptographic fallback.";
            if (typeof showToast === 'function') showToast(errorMsg, 'warning');
            try {
                const fallbackResult = await generateFallbackSignature(inputs);
                return resolve(fallbackResult);
            } catch (err) {
                return reject(err);
            }
        }

        // 3. Initialize Worker
        const worker = new Worker('/js/zk-worker.js');

        // Safety timeout (45s to protect low-end CPUs)
        const timeout = setTimeout(async () => {
            worker.terminate();
            const timeoutError = "ZK proof generation timed out. Executing cryptographic fallback...";
            if (typeof showToast === 'function') showToast(timeoutError, 'warning');
            
            try {
                const fallbackResult = await generateFallbackSignature(inputs);
                resolve(fallbackResult);
            } catch (fallbackErr) {
                reject(new Error(timeoutError));
            }
        }, 45000);

        const unloadHandler = () => {
            clearTimeout(timeout);
            worker.terminate();
        };
        window.addEventListener('beforeunload', unloadHandler, { once: true });

        // Worker Message Listener
        worker.onmessage = (e) => {
            clearTimeout(timeout);
            window.removeEventListener('beforeunload', unloadHandler);
            worker.terminate();

            const { success, proof, publicSignals, error, note } = e.data;

            if (success) {
                if (note && typeof showToast === 'function') {
                    showToast(note, 'info');
                }
                resolve({ isFallback: false, proofType: 'SNARK_GROTH16', proof, publicSignals });
            } else {
                console.warn("Worker execution returned false. Triggering fallback:", error);
                generateFallbackSignature(inputs).then(resolve).catch(reject);
            }
        };

        // Worker Runtime/OOM Error Listener
        worker.onerror = async (err) => {
            clearTimeout(timeout);
            window.removeEventListener('beforeunload', unloadHandler);
            worker.terminate();
            console.error("ZK Worker execution crashed (likely WASM OOM):", err);
            
            try {
                const fallbackResult = await generateFallbackSignature(inputs);
                resolve(fallbackResult);
            } catch (fallbackErr) {
                reject(new Error(err.message || "Failed to execute ZK worker script."));
            }
        };

        // Post message to worker
        worker.postMessage(inputs);
    });
}
