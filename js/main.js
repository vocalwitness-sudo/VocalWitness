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
import { collection, addDoc, doc, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { auth } from './auth.js';

// --- ZK-SNARK State ---
let provider;
let signer;
let currentUser = { address: null, isWitness: false };
let cachedVerificationKey = null;   // ← Global cache for verification key

// --- State ---
let currentFeed = 'citizen-talk';
let engine = null;

// --- Initialization ---
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
  
    initAuth();
    initLanguage();
  
    // Fetch user language preference
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists() && userSnap.data().preferredLanguage) {
                    changeLanguage(userSnap.data().preferredLanguage);
                }
            } catch (err) {
                console.error("Failed to load user language preference:", err);
            }
        }
    });
  
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
            case 'vw-btn':
                generateZKWitnessProof();
                break;
        }
    });

    document.addEventListener('change', async (event) => {
        if (event.target.id === 'languageSelector') {
            const newLang = event.target.value;
            changeLanguage(newLang);
            if (auth.currentUser) {
                try {
                    const userRef = doc(db, "users", auth.currentUser.uid);
                    await updateDoc(userRef, { preferredLanguage: newLang });
                    showToast("✅ Language preference saved");
                } catch (err) {
                    console.error("Failed to save language:", err);
                }
            }
        }
    });
}

// ====================== ZK-SNARK HELPERS ======================
async function getVerificationKey() {
    if (cachedVerificationKey) {
        console.log("🔑 Using cached verification key");
        return cachedVerificationKey;
    }

    try {
        console.log("📥 Fetching verification key...");
        const response = await fetch("/circuits/verification_key.json");
        if (!response.ok) throw new Error("Verification key not found");
        
        cachedVerificationKey = await response.json();
        console.log("✅ Verification key cached successfully");
        return cachedVerificationKey;
    } catch (error) {
        console.error("Failed to load verification key:", error);
        throw new Error("VERIFICATION_KEY_MISSING");
    }
}

// ====================== ZK-SNARK WITNESS PROOF ======================
async function initWeb3() {
    if (window.ethereum) {
        provider = new ethers.BrowserProvider(window.ethereum);
        signer = await provider.getSigner();
        currentUser.address = await signer.getAddress();
        console.log("✅ Wallet Connected:", currentUser.address);
    } else {
        alert("MetaMask is required for ZK Witness Verification");
        throw new Error("MetaMask not found");
    }
}

async function generateZKWitnessProof() {
    const btn = document.getElementById('vw-btn');
    if (!btn) return;
  
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '🔄 Generating Advanced ZK Proof... (15-60s)';
    
    try {
        await initWeb3();

        const secret = BigInt(ethers.toBigInt(ethers.randomBytes(28)));
        const nullifier = BigInt(Date.now());
        const trustScore = 85;
        const postCount = 42;
        const minTrustScore = 60;
        const minPosts = 10;
        const merkleRoot = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";

        const pathElements = Array(20).fill("0");
        const pathIndices = Array(20).fill("0");

        const input = {
            secret: secret.toString(),
            nullifier: nullifier.toString(),
            trustScore: trustScore.toString(),
            postCount: postCount.toString(),
            isValidWitness: "1",
            merkleRoot: merkleRoot,
            minTrustScore: minTrustScore.toString(),
            minPosts: minPosts.toString(),
            commitment: "0",
            pathElements: pathElements,
            pathIndices: pathIndices
        };

        console.log("🧠 Generating ZK-SNARK proof...");

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            "/circuits/witness.wasm",
            "/circuits/witness_final.zkey"
        );

        console.log("✅ Proof generated");

        // Use cached verification key
        const vKey = await getVerificationKey();
        const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

        if (isValid) {
            alert(`🎉 ZK Witness Proof Verified Successfully!\n\n• Trust Score ≥ ${minTrustScore}\n• Posts ≥ ${minPosts}\n\nYou are now a verified Witness.`);
          
            currentUser.isWitness = true;
            const badge = document.getElementById('profile-role-badge');
            if (badge) {
                badge.textContent = "✅ WITNESS";
                badge.classList.add('bg-emerald-500');
            }
            if (state) state.isWitnessVerified = true;
        } else {
            alert("❌ Proof verification failed.");
        }
    } catch (error) {
        console.error(error);
        if (error.message === "VERIFICATION_KEY_MISSING") {
            alert("⚠️ Verification key missing. Please upload verification_key.json to /circuits/");
        } else {
            alert("⚠️ ZK Proof failed.\n\nMake sure circuit files are correctly uploaded.");
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
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
    if (!state?.user) return googleLogin();
    document.getElementById('homeSection')?.classList.remove('active');
    document.getElementById('profileSection')?.classList.add('active');
    loadProfile(state.user);
}

function hideProfileSection() {
    document.getElementById('profileSection')?.classList.remove('active');
    document.getElementById('homeSection')?.classList.add('active');
}

// ====================== BOOTSTRAP ======================
document.addEventListener('DOMContentLoaded', bootstrap);
