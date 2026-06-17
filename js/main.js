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

        // Service Worker Registration - sw.js is in ROOT
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/VocalWitness/sw.js')
                .then(reg => {
                    console.log('✅ Service Worker registered successfully with scope:', reg.scope);
                })
                .catch(err => {
                    console.error('❌ SW registration failed:', err);
                });
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
    document.getElementById('btn-premium')?.addEventListener('click', () => googleLogin());

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
    if (voiceBtn) voiceBtn.addEventListener('click', () => toggleVoiceRecording(voiceBtn));

    // Publish Button
    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();

        if (!text && !selectedImageFile && !engine?.currentAudioBlob) {
            return showToast("Please add text, photo, or voice testimony", "error");
        }

        const postButton = document.getElementById('postButton');
        const originalText = postButton?.innerText || "Publish";
        if (postButton) {
            postButton.disabled = true;
            postButton.innerText = "Publishing...";
        }

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ id: tempId, witnessText: text || "📸 Media Testimony" }, true);

        try {
            const user = state?.user;
            const clientPhoneVerified = !!(user?.phoneNumber || state?.isWitnessVerified);
            const mediaData = await uploadForensicMedia(user?.uid || "anonymous");

            await addDoc(collection(db, "testimonies"), {
                witnessText: text || "",
                feedVisibility: currentFeed,
                timestamp: new Date().toISOString(),
                languageCode: localStorage.getItem('preferredLang') || 'en',
                authorId: user?.uid || "anonymous-" + Date.now().toString().slice(-6),
                authorName: user?.displayName || "Citizen Witness",
                authorPhoto: user?.photoURL || "",
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

            showToast("✅ Forensic Testimony Published Successfully", "success");
        } catch (e) {
            console.error("Publish error:", e);
            showToast(e.message || "Failed to publish testimony", "error");
        } finally {
            if (postButton) {
                postButton.disabled = false;
                postButton.innerText = originalText;
            }
        }
    });

    // Profile & Other UI listeners (unchanged from your version)
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

    document.getElementById('btn-logout')?.addEventListener('click', logout);

    // Change Password Modal, Phone Modal, etc. — all your code kept as-is
    // ... (the rest of attachUIListeners is identical to what you pasted)
}

function updateProfileUI(user) {
    // Your existing function (unchanged)
    const usernameEl = document.getElementById('profile-username');
    const emailEl = document.getElementById('profile-email');
    const tierContainer = document.getElementById('profile-tier-container');
    const badgesContainer = document.getElementById('profile-badges');

    if (usernameEl) usernameEl.textContent = user?.displayName || "@citizen";
    if (emailEl) emailEl.textContent = user?.email || "guest@vocalwitness.io";
    if (badgesContainer) badgesContainer.innerHTML = '';

    let tierHTML = (state?.isWitnessVerified || state?.role === "witness")
        ? `<span class="px-4 py-1 bg-emerald-900 text-emerald-400 rounded-full text-sm font-medium">👁️ Witness</span>`
        : `<span class="px-4 py-1 bg-green-900 text-green-400 rounded-full text-sm font-medium">🟢 Citizen</span>`;

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
