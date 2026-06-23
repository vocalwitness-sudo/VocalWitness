// js/main.js - CLEANED & FIXED
import { googleLogin, logout, initAuth, sendPhoneVerification, verifyPhoneCode } from "./auth.js";
import { initFeed, switchFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast, submitPeerVote } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording, resetMediaState } from './media.js';
import { VocalWitnessEngine } from './engine.js';
import { state } from './storage.js';
import { generateAndDownloadPDF } from './pdf.js';
import { loadProfile } from './profile.js';

let engineInstance = null;

// --- Bootstrap ---
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    
    initAuth();
    initLanguage();
    
    // Auth state handling
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

    // Initialize engine
    engineInstance = new VocalWitnessEngine();
    window.engineInstance = engineInstance; // for media.js
}

// --- Handlers ---
async function handlePostSubmission(button) {
    const isPremium = state?.user?.isPremium || false;
    if (!isPremium) {
        showToast("Premium account required to post", "error");
        return;
    }
    // TODO: Add actual post logic here
    showToast("Post submitted (demo)", "success");
}

async function handlePhoneVerification() {
    const ui = document.getElementById('phone-verification-ui');
    if (ui) ui.classList.toggle('hidden');
}

async function handleSendOTP() {
    const countryCode = document.getElementById('country-code')?.value || '+234';
    const phoneInput = document.getElementById('phone-number')?.value?.trim();
    if (!phoneInput) return showToast("Enter phone number", "error");

    const success = await sendPhoneVerification(countryCode + phoneInput);
    if (success) showToast("OTP sent!", "success");
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

// --- Main Event Delegation ---
function attachUIListeners() {
    document.addEventListener('click', async (event) => {
        const btn = event.target.closest('button');
        if (!btn) return;

        console.log("✅ Button clicked:", btn.id || btn.textContent?.slice(0, 30));

        // ID-based handlers
        switch (btn.id) {
            case 'postButton':
            case 'btn-post':
                await handlePostSubmission(btn);
                break;
            case 'btn-photo':
                // Trigger file input if needed
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
                loadProfile(); // or showProfileSection()
                break;
            case 'btn-close-profile':
                // hideProfileSection();
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
            case 'btn-witness-voice':
                switchFeed('witness-voice');
                break;
            case 'btn-citizen-talk':
                switchFeed('citizen-talk');
                break;
            case 'btn-download-pdf':
                generateAndDownloadPDF();
                break;
        }

        // Data-action handlers (e.g. Verify/Dispute buttons)
        const action = btn.getAttribute('data-action');
        if (action === 'peer-vote') {
            const id = btn.getAttribute('data-id');
            const type = btn.getAttribute('data-type');
            await submitPeerVote(id, type);
        }
    });
}

// Import missing Firebase functions
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './auth.js';

// Start the app
document.addEventListener('DOMContentLoaded', bootstrap);
