// js/main.js - FIXED VERSION (No duplicate code, no syntax error)
import { googleLogin, logout, initAuth, sendPhoneVerification, verifyPhoneCode } from "./auth.js";
import { initFeed, switchFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast, submitPeerVote } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording } from './media.js';
import { VocalWitnessEngine } from './engine.js';
import { state } from './storage.js';
import { generateAndDownloadPDF } from './pdf.js';
import { loadProfile } from './profile.js';

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './auth.js';

let engineInstance = null;

// Bootstrap the app
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
                console.error("Language load failed:", err);
            }
        }
    });

    initFeed(db, 'citizen-talk');
    attachUIListeners();

    engineInstance = new VocalWitnessEngine();
    window.engineInstance = engineInstance;
}

// Handlers
async function handlePostSubmission(button) {
    const isPremium = state?.user?.isPremium || false;
    if (!isPremium) {
        showToast("Premium account required to post", "error");
        return;
    }
    showToast("Post submitted (demo)", "success");
    // Add real posting logic later
}

async function handlePhoneVerification() {
    const ui = document.getElementById('phone-verification-ui');
    if (ui) ui.classList.toggle('hidden');
}

async function handleSendOTP() {
    const countryCode = document.getElementById('country-code')?.value || '+234';
    const phoneInput = document.getElementById('phone-number')?.value?.trim();
    if (!phoneInput) return showToast("Enter phone number", "error");

    try {
        const success = await sendPhoneVerification(countryCode + phoneInput);
        if (success) showToast("OTP sent!", "success");
    } catch (err) {
        console.error("OTP error:", err);
        showToast("Failed to send OTP", "error");
    }
}

async function handleVerifyOTP() {
    const code = document.getElementById('otp-input')?.value?.trim();
    if (!code || code.length !== 6) return showToast("Enter 6-digit OTP", "error");

    const success = await verifyPhoneCode(code);
    if (success) {
        showToast("✅ Verified!", "success");
        document.getElementById('phone-verification-ui')?.classList.add('hidden');
    }
}

// Main Event Delegation (This fixes the buttons)
function attachUIListeners() {
    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;

        console.log("✅ Button clicked:", btn.id || btn.textContent?.trim());

        // ID-based buttons
        switch (btn.id) {
            case 'postButton':
            case 'btn-post':
                await handlePostSubmission(btn);
                break;
            case 'btn-photo':
                // Trigger photo upload
                const fileInput = document.createElement('input');
                fileInput.type = 'file';
                fileInput.accept = 'image/*';
                fileInput.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
                fileInput.click();
                break;
            case 'btn-voice':
                toggleVoiceRecording(btn);
                break;
            case 'btn-profile':
                loadProfile();
                break;
            case 'btn-close-profile':
                document.getElementById('profileSection').classList.add('hidden');
                document.getElementById('homeSection').classList.add('active');
                break;
            case 'btn-verify-phone':
                handlePhoneVerification();
                break;
            case 'btn-send-otp':
                handleSendOTP();
                break;
            case 'btn-verify-otp':
                await handleVerifyOTP();
                break;
            case 'btn-logout':
                logout();
                break;
            case 'btn-download-pdf':
                generateAndDownloadPDF();
                break;
        }

        // Data-action buttons (Verify / Dispute in feed)
        const action = btn.getAttribute('data-action');
        if (action === 'peer-vote') {
            const id = btn.getAttribute('data-id');
            const type = btn.getAttribute('data-type');
            await submitPeerVote(id, type);
        }
    });
}

// Start everything
document.addEventListener('DOMContentLoaded', bootstrap);
