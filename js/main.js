// js/main.js
import { googleLogin, logout, initAuth } from "./auth.js";
import { initFeed, addPostToFeed } from './feed.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage, changeLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording, resetMediaState } from './media.js';
import { addDoc, collection } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let currentFeed = 'citizen-talk';

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
    // Language Selector
    document.getElementById('languageSelector')?.addEventListener('change', (e) => {
        changeLanguage(e.target.value);
    });

    // Two Lungs Navigation
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

    // Photo Button
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area') || document.createElement('div'));
        input.click();
    });

    // Voice Button
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', () => toggleVoiceRecording(voiceBtn));
    }

    // Publish Button
    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();
        if (!text) return showToast("Please write something", "error");

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ id: tempId, witnessText: text }, true);

        try {
            await addDoc(collection(db, "testimonies"), {
                witnessText: text,
                feedVisibility: currentFeed,
                timestamp: new Date().toISOString(),
                languageCode: localStorage.getItem('preferredLang') || 'en'
            });
            input.value = '';
            resetMediaState();
            showToast("✅ Published to Decentralized Ledger");
        } catch (e) {
            console.error(e);
            showToast("Publish failed", "error");
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
