import { googleLogin, logout, initAuth } from "./auth.js";
import { initFeed, addPostToFeed } from './feed.js';
import { db, storage } from './firebase-config.js'; // Ensure storage is exported
import { showToast } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording, resetMediaState, uploadForensicMedia, selectedImageFile } from './media.js';
import { addDoc, collection } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { VocalWitnessEngine, setEngine, engineInstance } from './engine.js'; // Ensure these are imported

let currentFeed = 'citizen-talk';
let engine;

export function init() {
    bootstrap();
}

async function bootstrap() {
    try {
        initAuth();
        initFeed(db, currentFeed);
        initLanguage();
        
        // Engine Initialization
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
    document.getElementById('btn-premium')?.addEventListener('click', () => {
        showToast("Premium features coming soon");
    });

    document.getElementById('google-login-btn')?.addEventListener('click', () => {
        googleLogin();
    });

    document.getElementById('languageSelector')?.addEventListener('change', (e) => {
        changeLanguage(e.target.value);
    });

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

    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area') || document.createElement('div'));
        input.click();
    });

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => toggleVoiceRecording(voiceBtn));
    }

    // Updated Publish Button
    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();
        
        if (!text && !selectedImageFile && !engineInstance?.currentAudioBlob) {
            return showToast("Add text, photo, or voice testimony", "error");
        }

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ id: tempId, witnessText: text || "Media Testimony" }, true);

        try {
            const mediaData = await uploadForensicMedia("current-user");

            await addDoc(collection(db, "testimonies"), {
                witnessText: text || "",
                feedVisibility: currentFeed,
                timestamp: new Date().toISOString(),
                languageCode: localStorage.getItem('preferredLang') || 'en',
                authorId: "user-" + Date.now().toString().slice(-6),
                ...mediaData
            });

            input.value = '';
            resetMediaState();
            showToast("✅ Forensic Testimony Published with Integrity Hash");
        } catch (e) {
            console.error(e);
            showToast("Failed to publish testimony", "error");
        }
    });

    document.getElementById('btn-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.remove('hidden');
    });

    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.add('hidden');
    });

    document.getElementById('btn-logout')?.addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof init === 'function') init();
});
