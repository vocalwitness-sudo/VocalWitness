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
import { loadProfile } from './profile.js';        // ← NEW
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// --- State ---
let currentFeed = 'citizen-talk';
let engine = null;

// --- Initialization ---
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
   
    initAuth();
    initLanguage();
   
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

        switch(btn.id) {
            case 'postButton':                    // Fixed ID
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
                if (state?.user) await generateAndDownloadPDF(state.user, db);
                else showToast("Please sign in", "error");
                break;
            case 'btn-logout':
                logout();
                break;
        }
    });

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

    const postInput = document.getElementById('mainInput');   // Updated to match your HTML
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
            language: "en",
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

function handleFeedSwitch(btn) {
    document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
   
    currentFeed = btn.id.includes('witness') ? 'witness-voice' : 'citizen-talk';
    initFeed(db, currentFeed);
   
    showToast(`${btn.id.includes('witness') ? '👁️ Witness Voice' : '💬 Citizen Talk'} Mode Activated`);
}

function showProfileSection() {
    if (!state?.user) {
        return googleLogin();
    }
   
    document.getElementById('homeSection')?.classList.remove('active');
    document.getElementById('profileSection')?.classList.add('active');
    
    // Use the enhanced profile system
    loadProfile(state.user);
}

function hideProfileSection() {
    document.getElementById('profileSection')?.classList.remove('active');
    document.getElementById('homeSection')?.classList.add('active');
}

// --- Start ---
document.addEventListener('DOMContentLoaded', bootstrap);
