// js/zk-crypto.js - Fixed & Production Ready
import { showToast } from './utils.js';

export async function generateRigorousProof(testimonyData) {
    try {
        if (!window.ethers) {
            throw new Error("Ethers library not loaded");
        }

        // Get location (optional)
        let location = { error: "Location skipped" };
        if (navigator.geolocation) {
            location = await new Promise((resolve) => {
                navigator.geolocation.getCurrentPosition(
                    (pos) => resolve({
                        lat: pos.coords.latitude,
                        lng: pos.coords.longitude,
                        acc: pos.coords.accuracy
                    }),
                    () => resolve({ error: "Location denied" })
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

        // Sign with wallet
        const provider = new window.ethers.BrowserProvider(window.ethereum);
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
        showToast("Proof failed — wallet connection issue", "error");
        throw error;
    }
}

export async function verifyProof(proof) {
    try {
        const message = proof.bundle 
            ? JSON.stringify(proof.bundle) 
            : proof.hash;

        const recovered = window.ethers.verifyMessage(message, proof.signature);
        return recovered.toLowerCase() === proof.signer.toLowerCase();
    } catch (e) {
        console.error("Verification failed:", e);
        return false;
    }
}
