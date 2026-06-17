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
            navigator.serviceWorker.register('/VocalWitness/sw.js')
                .then(reg => console.log('✅ SW registered:', reg.scope))
                .catch(err => console.error('❌ SW failed:', err));
        }

        initFeed(db, currentFeed);
        initLanguage();

        engine = new VocalWitnessEngine(db, storage);
        setEngine(engine);

        attachUIListeners();

        // FIX: Ensure UI is visible immediately upon load
        const profilePage = document.getElementById('profilePage');
        if (profilePage) profilePage.classList.remove('hidden');

        console.log("✅ VocalWitness Core Loaded Successfully");
        showToast("Platform Ready • Witness Voice + Citizen Talk Active");
    } catch (err) {
        console.error("Bootstrap error:", err);
        showToast("Initialization issue - check console", "error");
    }
}

function attachUIListeners() {
    document.getElementById('btn-premium')?.addEventListener('click', () => googleLogin());
    document.getElementById('languageSelector')?.addEventListener('change', (e) => changeLanguage(e.target.value));

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

    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) voiceBtn.addEventListener('click', () => toggleVoiceRecording(voiceBtn));

    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();

        if (!text && !selectedImageFile && !engine?.currentAudioBlob) {
            return showToast("Please add text, photo, or voice testimony", "error");
        }

        const postButton = document.getElementById('postButton');
        const originalText = postButton?.innerText || "Publish";
        postButton.disabled = true;
        postButton.innerText = "Publishing...";

        try {
            const user = state?.user;
            const mediaData = await uploadForensicMedia(user?.uid || "anonymous");
            await addDoc(collection(db, "testimonies"), {
                witnessText: text || "",
                feedVisibility: currentFeed,
                timestamp: new Date().toISOString(),
                authorId: user?.uid || "anonymous",
                ...mediaData
            });

            if (input) input.value = '';
            if (typeof resetMediaState === 'function') resetMediaState();
            showToast("✅ Published Successfully", "success");
        } catch (e) {
            showToast("Failed to publish", "error");
        } finally {
            postButton.disabled = false;
            postButton.innerText = originalText;
        }
    });

    document.getElementById('btn-logout')?.addEventListener('click', logout);
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof init === 'function') init();
});
