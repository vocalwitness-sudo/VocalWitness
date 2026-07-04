// js/zk-crypto.js - Rigorous Forensic Proof
import { showToast } from './utils.js';

export async function generateRigorousProof(testimonyData) {
  try {
    // 1. Capture context (GPS optional but powerful)
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

    // 2. Build forensic bundle
    const forensicBundle = {
      text: testimonyData.text || testimonyData.content,
      mediaHash: testimonyData.mediaUrl || testimonyData.imageUrl || "",
      timestamp: Date.now(),
      location,
      device: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        language: navigator.language
      }
    };

    // 3. SHA-256 hash
    const dataString = JSON.stringify(forensicBundle);
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(dataString));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 4. Sign with wallet (ethers)
    if (!window.ethereum) {
      throw new Error("Wallet not connected");
    }
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const signature = await signer.signMessage(hashHex);
    const signerAddress = await signer.getAddress();

    return {
      hash: hashHex,
      signature,
      signer: signerAddress,
      bundle: forensicBundle,
      algorithm: "SHA-256-ECDSA"
    };
  } catch (error) {
    console.error("Proof generation failed:", error);
    showToast("Proof failed — try manual escalation or check wallet", "error");
    throw error;
  }
}

// Verification helper
export async function verifyProof(proof) {
  try {
    const recovered = ethers.verifyMessage(proof.bundle ? JSON.stringify(proof.bundle) : proof.hash, proof.signature);  // adjust
    return recovered.toLowerCase() === proof.signer.toLowerCase();
  } catch (e) {
    return false;
  }
}
