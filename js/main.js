import { googleLogin, logout, initAuth, sendPhoneVerification, verifyPhoneCode } from "./auth.js";
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

export function init() {
    bootstrap();
}

async function bootstrap() {
    try {
        console.log("🚀 Initializing VocalWitness...");

        initAuth();

        // Service Worker Registration
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/VocalWitness/js/sw.js')
                .then(() => console.log('✅ Service Worker registered'))
                .catch(err => console.error('❌ SW registration failed:', err));
        }

        initFeed(db, currentFeed);
        initLanguage();
        
        // Core Engine
        engine = new VocalWitnessEngine(db, storage);
        setEngine(engine);
        
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

    // Navigation
    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => {
        currentFeed = 'witness-voice';
        initFeed(db, currentFeed);
        showToast("👁️ Witness Voice Mode Activated");
    });

    document.getElementById('btn-citizentalk')?.addEventListener('click', () => {
        currentFeed = 'citizen-talk';
        initFeed(db, currentFeed);
        showToast("💬 Citizen / Street Talk Mode Activated");
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

    // Publish Button
    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();
        if (!text && !selectedImageFile && !engine?.currentAudioBlob) {
            return showToast("Please add text, photo, or voice testimony", "error");
        }

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ id: tempId, witnessText: text || "📸 Media Testimony" }, true);

        const clientPhoneVerified = !!state?.user?.providerData?.some(p => p.providerId === 'phone') || !!document.getElementById('trust-score')?.innerText.includes('100');

        try {
            const mediaData = await uploadForensicMedia("current-user");
            await addDoc(collection(db, "testimonies"), {
                witnessText: text || "",
                feedVisibility: currentFeed,
                timestamp: new Date().toISOString(),
                languageCode: localStorage.getItem('preferredLang') || 'en',
                authorId: "user-" + Date.now().toString().slice(-6),
                ...mediaData,
                moderation: { 
                    trustScore: clientPhoneVerified ? 100 : 50, 
                    verificationsCount: 0, 
                    disputesCount: 0 
                }
            });

            if (input) input.value = '';
            if (typeof resetMediaState === 'function') resetMediaState();
            if (engine) engine.currentAudioBlob = null;

            showToast("✅ Forensic Testimony Published Successfully");
        } catch (e) {
            console.error(e);
            showToast("Failed to publish testimony", "error");
        }
    });

    // Profile Button
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        if (!state?.user) {
            googleLogin();
            return;
        }
        document.getElementById('profilePage')?.classList.remove('hidden');
        updateProfileUI(state.user);
    });

    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage')?.classList.add('hidden');
    });

    // Logout
    document.getElementById('btn-logout')?.addEventListener('click', logout);

    // ==================== CHANGE PASSWORD MODAL ====================
    const changePassModal = document.getElementById('changePasswordModal');
    const btnChangePassword = document.getElementById('btn-change-password');
    const cancelChangeBtn = document.getElementById('cancel-change-password');
    const confirmChangeBtn = document.getElementById('confirm-change-password');

    if (btnChangePassword) {
        btnChangePassword.addEventListener('click', () => {
            changePassModal?.classList.remove('hidden');
            const curr = document.getElementById('current-password');
            const npass = document.getElementById('new-password');
            const cpass = document.getElementById('confirm-password');
            if (curr) curr.value = '';
            if (npass) npass.value = '';
            if (cpass) cpass.value = '';
        });
    }

    if (cancelChangeBtn) {
        cancelChangeBtn.addEventListener('click', () => {
            changePassModal?.classList.add('hidden');
        });
    }

    changePassModal?.addEventListener('click', (e) => {
        if (e.target === changePassModal) {
            changePassModal.classList.add('hidden');
        }
    });

    if (confirmChangeBtn) {
        confirmChangeBtn.addEventListener('click', async () => {
            const currentPass = document.getElementById('current-password')?.value.trim();
            const newPass = document.getElementById('new-password')?.value.trim();
            const confirmPass = document.getElementById('confirm-password')?.value.trim();

            if (!currentPass || !newPass || !confirmPass) {
                return showToast("All fields are required", "error");
            }
            if (newPass.length < 6) {
                return showToast("New password must be at least 6 characters", "error");
            }
            if (newPass !== confirmPass) {
                return showToast("New passwords do not match", "error");
            }

            confirmChangeBtn.disabled = true;
            confirmChangeBtn.innerText = "Processing change...";

            const { changePassword } = await import('./auth.js');
            const success = await changePassword(currentPass, newPass);
            
            confirmChangeBtn.disabled = false;
            confirmChangeBtn.innerText = "Confirm & Save Changes";

            if (success) {
                changePassModal?.classList.add('hidden');
            }
        });
    }

    // ==================== PHONE VERIFICATION MODAL FLOW ====================
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
            if (step1Container && step2Container) {
                step1Container.classList.remove('hidden');
                step2Container.classList.add('hidden');
            }
            if (phoneNumberInput) phoneNumberInput.value = "";
            if (phoneOtpInput) phoneOtpInput.value = "";
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
                return showToast("Please enter a valid phone number starting with + and country code.", "error");
            }

            btnSendOtp.disabled = true;
            btnSendOtp.innerText = "Processing security handshake...";

            const isSent = await sendPhoneVerification(phoneRaw);
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
            if (!otpCode || otpCode.length !== 6 || isNaN(otpCode)) {
                return showToast("Please enter a valid 6-digit verification code.", "error");
            }

            btnVerifyOtp.disabled = true;
            btnVerifyOtp.innerText = "Anchoring confirmation data...";

            const success = await verifyPhoneCode(otpCode);
            if (success) {
                phoneModal?.classList.add('hidden');
                const trustScoreEl = document.getElementById('trust-score');
                if (trustScoreEl) trustScoreEl.innerText = "100";
            }

            btnVerifyOtp.disabled = false;
            btnVerifyOtp.innerText = "Verify & Upgrade Account";
        });
    }
}

// Profile UI Update
function updateProfileUI(user) {
    const usernameEl = document.getElementById('profile-username');
    const emailEl = document.getElementById('profile-email');
    const tierContainer = document.getElementById('profile-tier-container');
    const badgesContainer = document.getElementById('profile-badges');

    if (usernameEl) usernameEl.textContent = user?.displayName || "@citizen";
    if (emailEl) emailEl.textContent = user?.email || "guest@vocalwitness.io";

    if (badgesContainer) badgesContainer.innerHTML = '';

    let tierHTML = '';
    if (state?.isWitnessVerified || state?.role === "witness") {
        tierHTML = `<span class="px-4 py-1 bg-emerald-900 text-emerald-400 rounded-full text-sm font-medium">👁️ Witness</span>`;
    } else {
        tierHTML = `<span class="px-4 py-1 bg-green-900 text-green-400 rounded-full text-sm font-medium">🟢 Citizen</span>`;
    }

    if (tierContainer) tierContainer.innerHTML = tierHTML;

    const postCountEl = document.getElementById('post-count');
    const verifyCountEl = document.getElementById('verify-count');
    const reputationScoreEl = document.getElementById('reputation-score');

    if (postCountEl) postCountEl.textContent = state?.postCount || 0;
    if (verifyCountEl) verifyCountEl.textContent = state?.verifyCount || 0;
    if (reputationScoreEl) reputationScoreEl.textContent = state?.reputation || 50;
}

/* ==================== CORE PLATFORM CRYPTOGRAPHY UTILITIES ==================== */
export async function encryptKey(privateKey, masterLock) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedKey = new TextEncoder().encode(privateKey);
    
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        masterLock,
        encodedKey
    );
    return { iv, encrypted };
}

export async function decryptKey(encryptedData, iv, masterLock) {
    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        masterLock,
        encryptedData
    );
    return new TextDecoder().decode(decrypted);
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof init === 'function') init();
});

// Force the profile closed on initial page load, regardless of other settings
const profileContainer = document.getElementById('profilePage');
if (profileContainer) {
    profileContainer.classList.add('hidden');
}
