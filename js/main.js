// js/main.js
import { googleLogin, logout, initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import {
    handleImageSelect,
    toggleVoiceRecording,
    uploadForensicMedia,
    resetMediaState
} from './media.js';
import { VocalWitnessEngine } from './engine.js';
import { state } from './storage.js';
import { generateAndDownloadPDF } from './pdf.js';
import { loadProfile } from './profile.js';

import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// --- State ---
let currentFeed = 'citizen-talk';
let engine = null;

// --- Initialization ---
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
  
    initAuth();
    initLanguage();                    // ← Dynamic i18n initialization
    
    engine = new VocalWitnessEngine(db);
    if (typeof storage !== 'undefined') engine.setStorage(storage);
  
    initFeed(db, currentFeed);
    attachUIListeners();
  
    console.log("✅ Core Loaded Successfully");
    showToast("Platform Ready");
}

// --- Event Listeners ---
function attachUIListeners() {
    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;

        switch (btn.id) {
            case 'postButton':
            case 'btn-post':
                await handlePostSubmission(btn);
                break;
            case 'btn-photo':
                triggerPhotoUpload();
                break;
            case 'btn-voice':
                toggleVoiceRecording(btn);
                break;
            case 'btn-profile':
                showProfileSection();
                break;
            case 'btn-close-profile':
                hideProfileSection();
                break;
            case 'btn-download-pdf':
                if (state?.user) {
                    await generateAndDownloadPDF(state.user, db);
                } else {
                    showToast("Please sign in", "error");
                }
                break;
            case 'btn-logout':
                logout();
                break;
        }
    });

    // Language Selector
    document.addEventListener('change', (event) => {
        if (event.target.id === 'languageSelector') {
            changeLanguage(event.target.value);
        }
    });
}

// ====================== POST SUBMISSION ======================
async function handlePostSubmission(button) {
    if (!state?.user) {
        return showToast("Please sign in to post", "error");
    }

    const postInput = document.getElementById('mainInput');
    const postText = postInput?.value?.trim() || "";

    if (!postText && !window.selectedImageFile && !engine?.currentAudioBlob) {
        return showToast("Add text, photo, or voice testimony", "error");
    }

    try {
        button.disabled = true;
        button.textContent = "🔒 Securing to ledger...";

        const mediaData = await uploadForensicMedia(state.user.uid);

        await addDoc(collection(db, "testimonies"), {
            ...mediaData,
            author: state.user.displayName || "Anonymous",
            authorId: state.user.uid,
            content: postText,
            timestamp: new Date().toISOString(),
            verified: false,
            trustScore: 50,
            language: currentLang || "en",           // Use current language
            feedVisibility: currentFeed,
            contributionWeight: state.isWitnessVerified ? 2 : 1,
            tokenEligible: true
        });

        showToast("✅ Testimony published to ledger!", "success");
      
        resetMediaState();
        if (postInput) postInput.value = "";
       
    } catch (err) {
        console.error("Post failed:", err);
        showToast("❌ Failed: " + (err.message || err), "error");
    } finally {
        button.disabled = false;
        button.textContent = "Publish to Decentralized Ledger";
    }
}

// ====================== HELPER FUNCTIONS ======================
function triggerPhotoUpload() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
    input.click();
}

function showProfileSection() {
    if (!state?.user) {
        return googleLogin();
    }
  
    document.getElementById('homeSection')?.classList.remove('active');
    document.getElementById('profileSection')?.classList.add('active');
   
    loadProfile(state.user);           // Enhanced profile loading
}

function hideProfileSection() {
    document.getElementById('profileSection')?.classList.remove('active');
    document.getElementById('homeSection')?.classList.add('active');
}


// js/main.js
let provider;
let signer;
let currentUser = { address: null, isWitness: false };

async function initWeb3() {
    if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        currentUser.address = await signer.getAddress();
        console.log("✅ Connected:", currentUser.address);
    }
}

async function generateZKWitnessProof() {
    const btn = document.getElementById('vw-btn');
    const originalText = btn.innerHTML;
    
    btn.disabled = true;
    btn.innerHTML = '🔄 Generating ZK Proof... (This may take 10-30s)';

    try {
        await initWeb3();

        // Mock input for witness proof (in real app: hash of testimony + identity data)
        const input = {
            secret: 123456789,           // Private witness key / commitment
            nullifier: Date.now(),       // Anti-replay
            isValidWitness: 1
        };

        console.log("🧠 Generating ZK-SNARK proof...");

        // FullProve with mock circuit (replace with real .wasm + .zkey in production)
        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            "https://cdn.jsdelivr.net/gh/iden3/snarkjs@latest/build/circuit.wasm", // placeholder
            "https://cdn.jsdelivr.net/gh/iden3/snarkjs@latest/build/circuit_final.zkey" // placeholder
        );

        console.log("✅ Proof generated:", proof);
        console.log("Public Signals:", publicSignals);

        // Verify locally
        const vKey = await (await fetch("https://cdn.jsdelivr.net/gh/iden3/snarkjs@latest/build/verification_key.json")).json();
        const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

        if (isValid) {
            alert("🎉 ZK Witness Proof Verified Successfully!\n\nYou are now a verified Witness on the Ledger.");
            
            // Mark user as witness
            currentUser.isWitness = true;
            document.getElementById('profile-role-badge').textContent = "✅ WITNESS";
            document.getElementById('profile-role-badge').classList.add('bg-emerald-500');
        } else {
            alert("❌ Proof verification failed.");
        }

    } catch (error) {
        console.error(error);
        alert("⚠️ ZK Proof generation failed. (Demo mode - real circuits needed for production)");
    }

    btn.disabled = false;
    btn.innerHTML = originalText;
}

// Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    const vwBtn = document.getElementById('vw-btn');
    if (vwBtn) vwBtn.addEventListener('click', generateZKWitnessProof);

    // Other existing functionality...
    console.log("🚀 VocalWitness ZK-SNARK module loaded");
});
document.addEventListener('DOMContentLoaded', bootstrap);
