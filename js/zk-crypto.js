// js/zk-crypto.js - Rigorous Signature & Verification Engine
import { showToast } from './utils.js';

export async function generateRigorousProof(testimonyData) {
    try {
        const ethersLib = window.ethers;
        if (!ethersLib) {
            throw new Error("Ethers library not loaded");
        }

        // Get location with strict timeout guard
        let location = { error: "Location skipped" };
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            location = await new Promise((resolve) => {
                let completed = false;
                const timer = setTimeout(() => {
                    if (!completed) {
                        completed = true;
                        resolve({ error: "Location timeout" });
                    }
                }, 4000);

                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        if (!completed) {
                            completed = true;
                            clearTimeout(timer);
                            resolve({
                                lat: pos.coords.latitude,
                                lng: pos.coords.longitude,
                                acc: pos.coords.accuracy
                            });
                        }
                    },
                    (err) => {
                        if (!completed) {
                            completed = true;
                            clearTimeout(timer);
                            resolve({ error: err.message || "Location denied" });
                        }
                    },
                    { timeout: 4000 }
                );
            });
        }

        // Forensic Bundle
        const forensicBundle = {
            testimony: testimonyData,
            timestamp: Date.now(),
            location: location,
            userAgent: navigator.userAgent.substring(0, 100)
        };

        const dataString = JSON.stringify(forensicBundle);
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest("SHA-256", encoder.encode(dataString));
        const hashHex = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        if (!window.ethereum) {
            throw new Error("No Web3 wallet detected (e.g. MetaMask)");
        }

        // Dual-support for Ethers v5 and v6
        let provider, signer;
        if (ethersLib.BrowserProvider) {
            provider = new ethersLib.BrowserProvider(window.ethereum);
            signer = await provider.getSigner();
        } else if (ethersLib.providers?.Web3Provider) {
            provider = new ethersLib.providers.Web3Provider(window.ethereum);
            signer = provider.getSigner();
        } else {
            throw new Error("Compatible Ethers provider not found");
        }

        const getBytesFn = ethersLib.getBytes || ethersLib.utils?.arrayify;
        const hashBytes = getBytesFn("0x" + hashHex);
        const signature = await signer.signMessage(hashBytes);
        const signerAddress = await signer.getAddress();

        return {
            hash: "0x" + hashHex,
            signature,
            signer: signerAddress,
            bundle: forensicBundle
        };

    } catch (error) {
        console.error("Proof generation failed:", error);
        showToast(error.message || "Proof failed — wallet connection issue", "error");
        throw error;
    }
}

export async function verifyProof(proof) {
    try {
        const ethersLib = window.ethers;
        if (!ethersLib || !proof || !proof.signature || !proof.hash) {
            return false;
        }

        const getBytesFn = ethersLib.getBytes || ethersLib.utils?.arrayify;
        const verifyFn = ethersLib.verifyMessage || ethersLib.utils?.verifyMessage;

        const formattedHash = proof.hash.startsWith("0x") ? proof.hash : "0x" + proof.hash;
        const hashBytes = getBytesFn(formattedHash);
        const recovered = verifyFn(hashBytes, proof.signature);
        return recovered.toLowerCase() === proof.signer.toLowerCase();
    } catch (e) {
        console.error("Verification failed:", e);
        return false;
    }
}
