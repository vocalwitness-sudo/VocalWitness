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
let cachedVerificationKey = null;

// --- State ---
let currentFeed = 'citizen-talk';
let engine = null;

// --- Initialization ---
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
  
    initAuth();
    initLanguage();
  
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            try {
                const userRef = doc(db, "users", user.uid);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists() && userSnap.data().preferredLanguage) {
                    changeLanguage(userSnap.data().preferredLanguage);
                }
            } catch (err) {
                console.error("Failed to load language preference:", err);
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
    // Navigation Active State
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;

        if (btn.classList.contains('nav-btn')) {
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }

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
                if (state?.user) await generateAndDownloadPDF(state.user, db);
                else showToast("Please sign in", "error");
                break;
            case 'btn-logout':
                logout();
                break;
            case 'vw-btn':
                generateZKWitnessProof();
                break;
            case 'btn-verify-phone':
                handlePhoneVerification();
                break;
            case 'btn-send-otp':
                handleSendOTP();
                break;
        }
    });

    // Language Selector with persistence
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

// ====================== PHONE VERIFICATION INTEGRATION ======================
async function handlePhoneVerification() {
    const ui = document.getElementById('phone-verification-ui');
    if (ui) {
        ui.classList.toggle('hidden');
    }
}

async function handleSendOTP() {
    const countryCode = document.getElementById('country-code').value;
    const phoneNumberInput = document.getElementById('phone-number').value;
    const fullPhone = countryCode + phoneNumberInput;

    if (!phoneNumberInput) {
        showToast("Please enter phone number", "error");
        return;
    }

    const success = await sendPhoneVerification(fullPhone); // from auth.js
    if (success) {
        showToast("OTP sent! Check your phone.", "success");
    }
}

// ====================== POST SUBMISSION ======================
async function handlePostSubmission(button) { /* ... your existing code ... */ }

// ====================== ZK-SNARK (Advanced) ======================
async function initWeb3() { /* ... your existing code ... */ }

async function generateZKWitnessProof() { /* ... your existing code ... */ }

// ====================== HELPER FUNCTIONS ======================
function triggerPhotoUpload() { /* ... */ }

function showProfileSection() { /* ... */ }

function hideProfileSection() { /* ... */ }

// ====================== BOOTSTRAP ======================
document.addEventListener('DOMContentLoaded', bootstrap);
