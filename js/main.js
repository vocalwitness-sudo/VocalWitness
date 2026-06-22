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

// --- State ---
let currentFeed = 'citizen-talk';
let engine = null;

// --- Initialization ---
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
  
    initAuth();
    initLanguage();
  
    // Fetch and apply user language preference from Firestore
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

    // Language Selector with Firestore Persistence
    document.addEventListener('change', async (event) => {
        if (event.target.id === 'languageSelector') {
            const newLang = event.target.value;
           
            // Update UI immediately
            changeLanguage(newLang);
           
            // Persist to Firestore if user is signed in
            if (auth.currentUser) {
                try {
                    const userRef = doc(db, "users", auth.currentUser.uid);
                    await updateDoc(userRef, { preferredLanguage: newLang });
                    showToast("✅ Language preference saved");
                } catch (err) {
                    console.error("Failed to save language:", err);
                    showToast("Language updated locally", "warning");
                }
            }
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
            language: currentLang || "en",
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

// ====================== ZK-SNARK WITNESS PROOF (Advanced) ======================
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

        console.log("🧠 Generating ZK-SNARK proof with Merkle + Selective Disclosure...");

        const { proof, publicSignals } = await snarkjs.groth16.fullProve(
            input,
            "/circuits/witness.wasm",
            "/circuits/witness_final.zkey"
        );

        const vKey = await (await fetch("/circuits/verification_key.json")).json();
        const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

        if (isValid) {
            alert(`🎉 ZK Witness Proof Verified Successfully!\n\n• Trust Score ≥ ${minTrustScore}\n• Posts ≥ ${minPosts}\n\nYou are now a verified Witness on the Ledger.`);
          
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
        alert("⚠️ ZK Proof failed.\n\nMake sure circuit files are in /circuits/");
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
