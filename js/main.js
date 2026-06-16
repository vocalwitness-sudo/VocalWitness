// js/main.js - Final Upgraded Version with Profile Badges & Tier System
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
import { state } from './storage.js';   // Keep for now

let currentFeed = 'citizen-talk';
let engine = null;

export function init() {
    bootstrap();
}

async function bootstrap() {
    try {
        console.log("🚀 Initializing VocalWitness...");
        initAuth();
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

    // Two Lungs Navigation
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

    // Photo Button
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    // Voice Button
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => toggleVoiceRecording(voiceBtn));
    }

    // Publish Button - Full Media Support
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

            // Reset UI
            input.value = '';
            if (typeof resetMediaState === 'function') resetMediaState();
            if (engine) engine.currentAudioBlob = null;

            showToast("✅ Forensic Testimony Published Successfully");
        } catch (e) {
            console.error(e);
            showToast("Failed to publish testimony", "error");
        }
    });

    // Integrated Profile Trigger & UI Sync Action
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

    document.getElementById('btn-logout')?.addEventListener('click', logout);
}

// Profile Badges & Tier System Utilities
function updateProfileUI(user) {
    const usernameEl = document.getElementById('profile-username');
    const emailEl = document.getElementById('profile-email');
    const tierContainer = document.getElementById('profile-tier-container');
    const badgesContainer = document.getElementById('profile-badges');

    if (usernameEl) usernameEl.textContent = user?.displayName || "@citizen";
    if (emailEl) emailEl.textContent = user?.email || "guest@vocalwitness.io";

    // Clear previous badges
    if (badgesContainer) badgesContainer.innerHTML = '';

    let tierHTML = '';

    if (state?.isWitnessVerified) {
        tierHTML = `<span class="px-4 py-1 bg-emerald-900 text-emerald-400 rounded-full text-sm font-medium">👁️ Witness</span>`;
        addBadge("👁️ Witness", "emerald");
        
        if (state.reputation >= 70) {
            addBadge("⭐ Trusted Witness", "purple");
        }
    } else {
        tierHTML = `<span class="px-4 py-1 bg-green-900 text-green-400 rounded-full text-sm font-medium">🟢 Citizen</span>`;
        addBadge("🟢 Citizen", "green");
    }

    if (tierContainer) tierContainer.innerHTML = tierHTML;

    // Update stats
    const postCountEl = document.getElementById('post-count');
    const verifyCountEl = document.getElementById('verify-count');
    const reputationScoreEl = document.getElementById('reputation-score');

    if (postCountEl) postCountEl.textContent = state?.postCount || 0;
    if (verifyCountEl) verifyCountEl.textContent = state?.verifyCount || 0;
    if (reputationScoreEl) reputationScoreEl.textContent = state?.reputation || 42;
}

function addBadge(text, color) {
    const container = document.getElementById('profile-badges');
    if (!container) return;
    
    const badge = document.createElement('span');
    badge.className = `px-4 py-1 bg-${color}-900 text-${color}-400 rounded-full text-sm font-medium`;
    badge.textContent = text;
    container.appendChild(badge);
}

// Safety fallback
document.addEventListener('DOMContentLoaded', () => {
    if (typeof init === 'function') init();
});
