import { googleLogin, logout, initAuth } from "./auth.js";
import { initFeed, addPostToFeed } from './feed.js';
import { db, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import {
    handleImageSelect,
    toggleVoiceRecording,
    resetMediaState,
    uploadForensicMedia,
    selectedImageFile,
    setEngine
} from './media.js';

import { addDoc, collection } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { VocalWitnessEngine } from './engine.js';
import { state } from './storage.js';

let currentFeed = 'citizen-talk';
let engine = null;

// Main initialization
export function init() {
    bootstrap();
}

async function bootstrap() {
    try {
        console.log("🚀 Initializing VocalWitness...");
        
        initAuth();
        initLanguage();
        
        // Core Engine
        engine = new VocalWitnessEngine(db, storage);
        setEngine(engine);
        
        initFeed(db, currentFeed);
        attachUIListeners();
        
        console.log("✅ VocalWitness Core Loaded Successfully");
        showToast("Platform Ready • Witness Voice + Citizen Talk Active");
    } catch (err) {
        console.error("Bootstrap error:", err);
        showToast("Initialization issue - check console", "error");
    }
}

function attachUIListeners() {
    // Premium Button
    document.getElementById('btn-premium')?.addEventListener('click', () => {
        googleLogin();
    });

    // Language Selector
    document.getElementById('languageSelector')?.addEventListener('change', (e) => {
        changeLanguage(e.target.value);
    });

    // Feed Navigation
    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => {
        currentFeed = 'witness-voice';
        initFeed(db, currentFeed);
        showToast("👁️ Witness Voice Mode Activated");
    });

    document.getElementById('btn-citizentalk')?.addEventListener('click', () => {
        currentFeed = 'citizen-talk';
        initFeed(db, currentFeed);
        showToast("💬 Citizen Talk Mode Activated");
    });

    // Media Buttons
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => toggleVoiceRecording(voiceBtn));
    }

    // Publish Button - FIXED authorId
    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();

        if (!text && !selectedImageFile && !engine?.currentAudioBlob) {
            return showToast("Please add text, photo, or voice testimony", "error");
        }

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ id: tempId, witnessText: text || "📸 Media Testimony" }, true);

        const clientPhoneVerified = !!state?.user?.providerData?.some(p => p.providerId === 'phone') ||
                                   !!document.getElementById('trust-score')?.innerText.includes('100');

        try {
            const mediaData = await uploadForensicMedia("current-user");

            await addDoc(collection(db, "testimonies"), {
                witnessText: text || "",
                feedVisibility: currentFeed,
                timestamp: new Date().toISOString(),
                languageCode: localStorage.getItem('preferredLang') || 'en',
                
                // FIXED: Use real Firebase UID when logged in
                authorId: state?.user?.uid || "anonymous",
                
                ...mediaData,
                moderation: {
                    trustScore: clientPhoneVerified ? 100 : 50,
                    verificationsCount: 0,
                    disputesCount: 0
                }
            });

            // Reset form
            input.value = '';
            if (typeof resetMediaState === 'function') resetMediaState();
            if (engine) engine.currentAudioBlob = null;

            showToast("✅ Forensic Testimony Published Successfully");
        } catch (e) {
            console.error("Publish error:", e);
            showToast("Failed to publish testimony. Check permissions or login.", "error");
        }
    });

    // ==================== PROFILE SECTION SWITCHING ====================
    const homeSection = document.getElementById('homeSection');
    const profileSection = document.getElementById('profileSection');

    // Open Profile
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        if (!state?.user) {
            showToast("Please sign in to access your profile", "error");
            googleLogin();
            return;
        }
        homeSection.classList.remove('active');
        profileSection.classList.add('active');
        updateProfileUI(state.user);
    });

    // Close Profile (Return to Home)
    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
        profileSection.classList.remove('active');
        homeSection.classList.add('active');
    });

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', logout);

    // ==================== PHONE VERIFICATION MODAL ====================
    const phoneModal = document.getElementById('phoneModal');
    const btnOpenPhoneModal = document.getElementById('btn-verify-phone');
    const btnClosePhoneModal = document.getElementById('close-phone-modal');
    const step1Container = document.getElementById('phone-step-1');
    const step2Container = document.getElementById('phone-step-2');
    const phoneNumberInput = document.getElementById('phone-number-input');
    const phoneOtpInput = document.getElementById('phone-otp-input');
    const btnSendOtp = document.getElementById('btn-send-otp');
    const btnVerifyOtp = document.getElementById('btn-verify-otp');

    if (btnOpenPhoneModal) {
        btnOpenPhoneModal.addEventListener('click', () => {
            step1Container?.classList.remove('hidden');
            step2Container?.classList.add('hidden');
            phoneNumberInput.value = "";
            phoneOtpInput.value = "";
            phoneModal?.classList.remove('hidden');
        });
    }

    if (btnClosePhoneModal) {
        btnClosePhoneModal.addEventListener('click', () => {
            phoneModal?.classList.add('hidden');
        });
    }

    if (btnSendOtp) {
        btnSendOtp.addEventListener('click', async () => {
            const phoneRaw = phoneNumberInput?.value.trim();
            if (!phoneRaw || !phoneRaw.startsWith('+') || phoneRaw.length < 8) {
                return showToast("Please enter a valid phone number with country code (+234...)", "error");
            }
            btnSendOtp.disabled = true;
            btnSendOtp.innerText = "Processing...";
            
            const isSent = await sendPhoneVerification(phoneRaw); // Make sure this function is imported
            if (isSent) {
                step1Container?.classList.add('hidden');
                step2Container?.classList.remove('hidden');
            }
            
            btnSendOtp.disabled = false;
            btnSendOtp.innerText = "Send Verification Code";
        });
    }

    if (btnVerifyOtp) {
        btnVerifyOtp.addEventListener('click', async () => {
            const otpCode = phoneOtpInput?.value.trim();
            if (!otpCode || otpCode.length !== 6) {
                return showToast("Please enter a valid 6-digit code", "error");
            }
            btnVerifyOtp.disabled = true;
            btnVerifyOtp.innerText = "Verifying...";
            
            const success = await verifyPhoneCode(otpCode);
            if (success) {
                phoneModal?.classList.add('hidden');
                const trustScoreEl = document.getElementById('trust-score');
                if (trustScoreEl) trustScoreEl.innerText = "100";
                showToast("✅ Phone verified successfully!", "success");
            }
            
            btnVerifyOtp.disabled = false;
            btnVerifyOtp.innerText = "Verify & Upgrade Account";
        });
    }
}

// Update Profile UI
function updateProfileUI(user) {
    document.getElementById('profile-username').textContent = user?.displayName || "@citizen";
    document.getElementById('profile-email').textContent = user?.email || "guest@vocalwitness.io";

    // Tier
    const tierContainer = document.getElementById('profile-tier-container');
    const isWitness = state?.isWitnessVerified || state?.role === "witness";
    tierContainer.innerHTML = isWitness 
        ? `<span class="px-4 py-1 bg-emerald-900 text-emerald-400 rounded-full text-sm font-medium">👁️ Witness</span>`
        : `<span class="px-4 py-1 bg-green-900 text-green-400 rounded-full text-sm font-medium">🟢 Citizen</span>`;

    // Stats
    document.getElementById('post-count').textContent = state?.postCount || 0;
    document.getElementById('verify-count').textContent = state?.verifyCount || 0;
    document.getElementById('reputation-score').textContent = state?.reputation || 50;
}

// Safety fallback
document.addEventListener('DOMContentLoaded', () => {
    if (typeof init === 'function') init();
});
