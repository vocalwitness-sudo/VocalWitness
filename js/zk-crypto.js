// js/zk-crypto.js - Fixed (uses global window.ethers)
import { showToast } from './utils.js';

export async function generateRigorousProof(testimonyData) {
  try {
    if (!window.ethers) throw new Error("Ethers not loaded from index.html");

    // ... (your existing forensic bundle code) ...
    let location = { error: "Location skipped" };
    if (navigator.geolocation) {
      location = await new Promise((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }),
          () => resolve({ error: "Location denied" })
        );
      });
    }

    const forensicBundle = { /* your existing bundle */ };
    const dataString = JSON.stringify(forensicBundle);
    const hashHex = /* your SHA256 code */;

    const provider = new window.ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const signature = await signer.signMessage(hashHex);
    const signerAddress = await signer.getAddress();

    return { hash: hashHex, signature, signer: signerAddress, bundle: forensicBundle };
  } catch (error) {
    console.error(error);
    showToast("Proof failed — wallet connection issue", "error");
    throw error;
  }
}

export async function verifyProof(proof) {
  try {
    const recovered = window.ethers.verifyMessage(
      proof.bundle ? JSON.stringify(proof.bundle) : proof.hash, 
      proof.signature
    );
    return recovered.toLowerCase() === proof.signer.toLowerCase();
  } catch (e) {
    return false;
  }
}
