import { googleLogin, logout, initAuth } from "./auth.js";
import { initFeed, addPostToFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import { 
    handleImageSelect, 
    toggleVoiceRecording, 
    resetMediaState,
    uploadForensicMedia,
    selectedImageFile 
} from './media.js';
import { addDoc, collection } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let currentFeed = 'citizen-talk';
let engine; // Local reference for engine

export function init() {
    bootstrap();
}

async function bootstrap() {
    try {
        initAuth();
        initFeed(db, currentFeed);
        initLanguage();
       
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
        showToast("Premium features coming soon");
    });

    // Google Login
    document.getElementById('google-login-btn')?.addEventListener('click', () => {
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
        showToast("👁️ Witness Voice Mode");
    });

    document.getElementById('btn-citizentalk')?.addEventListener('click', () => {
        currentFeed = 'citizen-talk';
        initFeed(db, currentFeed);
        showToast("💬 Citizen / Street Talk Mode");
    });

    // Photo Upload
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area') || document.createElement('div'));
        input.click();
    });

    // Voice Recording
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => toggleVoiceRecording(voiceBtn));
    }

    // ==================== IMPROVED PUBLISH BUTTON ====================
    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();

        if (!text && !selectedImageFile && !engine?.currentAudioBlob) {
            return showToast("Add text, photo, or voice testimony", "error");
        }

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ 
            id: tempId, 
            witnessText: text || "📸 Voice + Photo Testimony" 
        }, true);

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
                    trustScore: 100, 
                    verificationsCount: 0, 
                    disputesCount: 0 
                }
            });

            // Reset everything
            input.value = '';
            resetMediaState();
            if (engine) engine.currentAudioBlob = null;

            showToast("✅ Forensic Testimony Published with Integrity Hashes");
        } catch (e) {
            console.error(e);
            showToast("Failed to publish", "error");
        }
    });

    // Profile
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.remove('hidden');
    });

    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.add('hidden');
    });

    document.getElementById('btn-logout')?.addEventListener('click', logout);
}

// Safety fallback
document.addEventListener('DOMContentLoaded', () => {
    if (typeof init === 'function') init();
});
