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
            case 'btn-witness-voice': switchFeed('witness-voice'); break;
            case 'btn-citizen-talk': switchFeed('citizen-talk'); break;
        });
    });


        document.addEventListener('click', async (event) => {
    const btn = event.target.closest('button');
    if (!btn) return;
    
    // DEBUG: Click this in your app, check your console to see if the ID is detected
    console.log("Button clicked:", btn.id); 

    // ... your switch case code

        // Handle Nav Selection
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
            case 'btn-verify-otp': // Added this missing case
                await handleVerifyOTP();
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

let currentPhoneNumber = "";

async function handlePhoneVerification() {
    const ui = document.getElementById('phone-verification-ui');
    if (ui) ui.classList.toggle('hidden');
}

async function handleSendOTP() {
    const countryCode = document.getElementById('country-code')?.value;
    const phoneInput = document.getElementById('phone-number')?.value?.trim();
    
    if (!phoneInput) {
        showToast("Please enter your phone number", "error");
        return;
    }

    currentPhoneNumber = countryCode + phoneInput;

    try {
        // Ensure sendPhoneVerification is imported from auth.js
        const success = await sendPhoneVerification(currentPhoneNumber);
        
        if (success) {
            showToast("OTP sent! Check your phone.", "success");
            
            const otpSection = document.getElementById('otp-section');
            const sendBtn = document.getElementById('btn-send-otp');
            
            if (otpSection) otpSection.classList.remove('hidden');
            if (sendBtn) sendBtn.classList.add('hidden');
            
            const otpInput = document.getElementById('otp-input');
            if (otpInput) otpInput.focus();
        }
    } catch (err) {
        console.error("OTP Send Error:", err);
        showToast("Failed to send OTP", "error");
    }
}

async function handleVerifyOTP() {
    const otpInput = document.getElementById('otp-input');
    const code = otpInput?.value?.trim();

    if (!code || code.length < 6) {
        showToast("Please enter the 6-digit OTP", "error");
        return;
    }

    // Ensure verifyPhoneCode is imported from auth.js
    const success = await verifyPhoneCode(code);
    
    if (success) {
        showToast("✅ Phone verified successfully!", "success");
        const ui = document.getElementById('phone-verification-ui');
        const otpSection = document.getElementById('otp-section');
        const sendBtn = document.getElementById('btn-send-otp');
        
        if (ui) ui.classList.add('hidden');
        if (otpSection) otpSection.classList.add('hidden');
        if (sendBtn) sendBtn.classList.remove('hidden');
        if (otpInput) otpInput.value = "";
    }
}
            
            // Toggle visibility for OTP input section
            const otpSection = document.getElementById('otp-section');
            const sendBtn = document.getElementById('btn-send-otp');
            
            if (otpSection) otpSection.classList.remove('hidden');
            if (sendBtn) sendBtn.classList.add('hidden');
            
            const otpInput = document.getElementById('otp-input');
            if (otpInput) otpInput.focus();
        }
    } catch (err) {
        console.error("OTP Send Error:", err);
        showToast("Failed to send OTP", "error");
    }
}
async function handleVerifyOTP() {
    const otpInput = document.getElementById('otp-input');
    const code = otpInput.value.trim();

    if (code.length !== 6) {
        showToast("Please enter the 6-digit OTP", "error");
        return;
    }

    const success = await verifyPhoneCode(code);
    
    if (success) {
        // Hide UI after successful verification
        document.getElementById('phone-verification-ui').classList.add('hidden');
        document.getElementById('otp-section').classList.add('hidden');
        document.getElementById('btn-send-otp').classList.remove('hidden');
        otpInput.value = "";
    }
}

// In attachUIListeners() - Add these cases:
case 'btn-verify-phone':
    handlePhoneVerification();
    break;
case 'btn-send-otp':
    handleSendOTP();
    break;
case 'btn-verify-otp':
    handleVerifyOTP();
    break;


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
