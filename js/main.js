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

        try {
            const mediaData = await uploadForensicMedia("current-user");
            await addDoc(collection(db, "testimonies"), {
                witnessText: text || "",
                feedVisibility: currentFeed,
                timestamp: new Date().toISOString(),
                languageCode: localStorage.getItem('preferredLang') || 'en',
                authorId: "user-" + Date.now().toString().slice(-6),
                ...mediaData,
                moderation: { trustScore: 100, verificationsCount: 0, disputesCount: 0 }
            });

            input.value = '';
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
        document.getElementById('profilePage').classList.remove('hidden');
        updateProfileUI(state.user);
    });

    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.add('hidden');
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
            changePassModal.classList.remove('hidden');
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-password').value = '';
        });
    }

    if (cancelChangeBtn) {
        cancelChangeBtn.addEventListener('click', () => {
            changePassModal.classList.add('hidden');
        });
    }

    changePassModal?.addEventListener('click', (e) => {
        if (e.target === changePassModal) {
            changePassModal.classList.add('hidden');
        }
    });

    if (confirmChangeBtn) {
        confirmChangeBtn.addEventListener('click', async () => {
            const currentPass = document.getElementById('current-password').value.trim();
            const newPass = document.getElementById('new-password').value.trim();
            const confirmPass = document.getElementById('confirm-password').value.trim();

            if (!currentPass || !newPass || !confirmPass) {
                return showToast("All fields are required", "error");
            }
            if (newPass.length < 6) {
                return showToast("New password must be at least 6 characters", "error");
            }
            if (newPass !== confirmPass) {
                return showToast("New passwords do not match", "error");
            }

            // Import dynamically to avoid circular issues
            const { changePassword } = await import('./auth.js');
            const success = await changePassword(currentPass, newPass);
            
            if (success) {
                changePassModal.classList.add('hidden');
            }
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

    // Stats
    const postCountEl = document.getElementById('post-count');
    const verifyCountEl = document.getElementById('verify-count');
    const reputationScoreEl = document.getElementById('reputation-score');

    if (postCountEl) postCountEl.textContent = state?.postCount || 0;
    if (verifyCountEl) verifyCountEl.textContent = state?.verifyCount || 0;
    if (reputationScoreEl) reputationScoreEl.textContent = state?.reputation || 50;
}

// Safety fallback
document.addEventListener('DOMContentLoaded', () => {
    if (typeof init === 'function') init();
});
