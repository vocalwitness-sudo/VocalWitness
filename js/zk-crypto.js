// js/zk-crypto.js - Rigorous Signature & Verification Engine
import { showToast } from './utils.js';

export async function generateRigorousProof(testimonyData) {
    try {
        const ethersLib = window.ethers;
        if (!ethersLib) {
            throw new Error("Ethers library not loaded");
        }

        // Get location (optional with timeout guard)
        let location = { error: "Location skipped" };
        if (navigator.geolocation) {
            location = await new Promise((resolve) => {
                const timer = setTimeout(() => resolve({ error: "Location timeout" }), 4000);
                navigator.geolocation.getCurrentPosition(
                    (pos) => {
                        clearTimeout(timer);
                        resolve({
                            lat: pos.coords.latitude,
                            lng: pos.coords.longitude,
                            acc: pos.coords.accuracy
                        });
                    },
                    () => {
                        clearTimeout(timer);
                        resolve({ error: "Location denied" });
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

        const provider = new ethersLib.BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const signature = await signer.signMessage(hashHex);
        const signerAddress = await signer.getAddress();

        return {
            hash: hashHex,
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

        // Recover address specifically from the hashHex message that was signed
        const recovered = ethersLib.verifyMessage(proof.hash, proof.signature);
        return recovered.toLowerCase() === proof.signer.toLowerCase();
    } catch (e) {
        console.error("Verification failed:", e);
        return false;
    }
}
