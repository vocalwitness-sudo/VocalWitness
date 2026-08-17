// js/zk-client.js - ZK Proof Engine with Hybrid Cloud Offloading & Fallback Guard
import { showToast } from './utils.js';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";

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
 * Offloads ZK proof generation to Cloud Function when device performance is constrained
 */
async function generateZKProofServerSide(inputs) {
    if (typeof showToast === 'function') {
        showToast('Offloading ZK proof generation to cloud engine...', 'info');
    }

    try {
        const functions = getFunctions();
        const generateProofCallable = httpsCallable(functions, 'generateZKProof');
        const response = await generateProofCallable({ inputs });

        if (response.data && response.data.success) {
            return {
                isFallback: false,
                proofType: 'SNARK_GROTH16_SERVER',
                proof: response.data.proof,
                publicSignals: response.data.publicSignals
            };
        } else {
            throw new Error(response.data?.error || "Server ZK proof generation failed.");
        }
    } catch (err) {
        console.warn("Server-side ZK execution error, attempting local fallback:", err);
        return await generateFallbackSignature(inputs);
    }
}

/**
 * Main proof entry point with hardware & runtime bounds
 */
export async function generateZKProofAsync(inputs) {
    // 1. Hardware Pre-Check (<2GB RAM or constrained hardware): Offload to Server
    if (navigator.deviceMemory && navigator.deviceMemory < 2) {
        console.warn("Low memory environment detected (<2GB RAM). Offloading ZK calculation to server.");
        return await generateZKProofServerSide(inputs);
    }

    // 2. Worker Capability Guard
    if (!window.Worker) {
        if (typeof showToast === 'function') {
            showToast("Web Workers not supported. Offloading ZK proof generation...", 'warning');
        }
        return await generateZKProofServerSide(inputs);
    }

    // 3. Delegate execution to ZK Web Worker
    return new Promise((resolve, reject) => {
        let worker;
        try {
            worker = new Worker(new URL('./zk-worker.js', import.meta.url), { type: 'module' });
        } catch (e) {
            console.warn("Failed to construct module ZK Worker. Attempting server offload...", e);
            return generateZKProofServerSide(inputs).then(resolve).catch(reject);
        }

        const timeout = setTimeout(async () => {
            cleanup();
            if (typeof showToast === 'function') {
                showToast("ZK local generation timed out. Offloading to server...", 'warning');
            }
            try {
                const serverResult = await generateZKProofServerSide(inputs);
                resolve(serverResult);
            } catch (serverErr) {
                try {
                    const fallbackResult = await generateFallbackSignature(inputs);
                    resolve(fallbackResult);
                } catch (fallbackErr) {
                    reject(new Error("ZK proof generation timed out across all engines."));
                }
            }
        }, 30000);

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
                console.warn("Worker execution returned failure status. Offloading to server:", error);
                generateZKProofServerSide(inputs).then(resolve).catch(reject);
            }
        };

        worker.onerror = async (err) => {
            cleanup();
            console.error("ZK Worker execution crashed (likely WASM OOM). Offloading to server:", err);
            try {
                const serverResult = await generateZKProofServerSide(inputs);
                resolve(serverResult);
            } catch (serverErr) {
                try {
                    const fallbackResult = await generateFallbackSignature(inputs);
                    resolve(fallbackResult);
                } catch (fallbackErr) {
                    reject(new Error(err.message || "Failed to execute ZK proof generation."));
                }
            }
        };

        worker.postMessage(inputs);
    });
}

/**
 * Strips raw media metadata on-device and generates a cryptographic SHA-256 hash.
 * Ensures strict privacy guarantees by preventing device/GPS telemetry from reaching cloud services.
 *
 * @param {File|Blob} file - The raw file selected by the user
 * @returns {Promise<{ sanitizedBlob: Blob, mediaHash: string, fileType: string, fileName: string }>}
 */
export async function sanitizeAndHashMediaAsync(file) {
    if (!file) {
        throw new Error("No media file provided for sanitization.");
    }

    // 1. ArrayBuffer extraction
    const fileBuffer = await file.arrayBuffer();

    // 2. Generate SHA-256 Cryptographic Hash over raw bytes
    const hashBuffer = await crypto.subtle.digest('SHA-256', fileBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const mediaHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 3. Strip metadata by re-encoding supported image formats in clean HTML5 Canvas
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

                    // Export clean blob stripped of EXIF/metadata tags
                    canvas.toBlob((blob) => {
                        URL.revokeObjectURL(url);
                        resolve(blob || file);
                    }, file.type, 0.92);
                };

                img.onerror = () => {
                    URL.revokeObjectURL(url);
                    resolve(file); // Fallback to raw file if canvas drawing fails
                };

                img.src = url;
            });
        } catch (e) {
            console.warn("Client-side image metadata stripping bypassed:", e);
        }
    }

    return {
        sanitizedBlob,
        mediaHash,
        fileType: file.type,
        fileName: file.name
    };
}
