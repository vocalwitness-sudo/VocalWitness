// js/main.js
import { initAuth, logout, googleLogin } from "./auth.js";
import { initFeed, addPostToFeed } from './feed.js';
import { VocalWitnessEngine } from './engine.js';
import { upgradeToWitnessTier } from './signup.js';
import { db, storage } from './firebase-config.js';
import { showToast, initLanguage } from './utils.js';
import { handleImageSelect, toggleVoiceRecording, resetMediaState } from './media.js';

let engine;
let currentFeed = 'citizen-talk';

export async function init() {
    try {
        console.log("🚀 VocalWitness Initializing...");
        engine = new VocalWitnessEngine(db, storage);
        initAuth();
        initFeed(db, currentFeed);
        initLanguage();
        attachUIListeners();
        console.log("✅ VocalWitness Node Online");
    } catch (err) {
        console.error("Initialization failed:", err);
        showToast("Failed to initialize node", "error");
    }
}

function attachUIListeners() {
    // Auth UI updates
    window.addEventListener('auth-changed', (e) => {
        const user = e.detail.user;
        if (user) {
            document.getElementById('profile-username').textContent = user.displayName || user.email || "Witness";
            document.getElementById('profile-email').textContent = user.email || "";
        }
    });

    // === SEARCH BAR ===
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase().trim();
            initFeed(db, currentFeed, term);   // Pass search term to feed
        });
    }

    // === DATA MODE TOGGLE (Witness / Citizen) ===
    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => {
        currentFeed = 'witness-voice';
        updateActiveFeedButton();
        initFeed(db, currentFeed);
    });

    document.getElementById('btn-citizentalk')?.addEventListener('click', () => {
        currentFeed = 'citizen-talk';
        updateActiveFeedButton();
        initFeed(db, currentFeed);
    });

    // Media
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';

        let previewArea = document.getElementById('preview-area');
        if (!previewArea) {
            previewArea = document.createElement('div');
            previewArea.id = 'preview-area';
            const textarea = document.getElementById('mainInput');
            if (textarea) textarea.parentNode.insertBefore(previewArea, textarea.nextSibling);
        }

        input.onchange = (e) => handleImageSelect(e, previewArea);
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', () => {
        toggleVoiceRecording(document.getElementById('btn-voice'));
    });

    // Post Button
    document.getElementById('postButton')?.addEventListener('click', async () => {
        const input = document.getElementById('mainInput');
        const text = input?.value.trim();
        if (!text) return showToast("Please provide a description", "error");

        const tempId = 'temp-' + Date.now();
        addPostToFeed({ id: tempId, witnessText: text }, true);

        try {
            const { addDoc, collection } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
            
            await addDoc(collection(db, "testimonies"), {
                witnessText: text,
                feedVisibility: currentFeed,
                authorId: engine?.currentUserId || "anonymous",
                timestamp: new Date().toISOString()
            });

            input.value = '';
            resetMediaState();
            showToast("✅ Published to Decentralized Ledger");
        } catch (e) {
            console.error("Publish error:", e);
            showToast("Failed to publish", "error");
        }
    });

    // Profile & Auth
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.remove('hidden');
    });

    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.add('hidden');
    });

    document.getElementById('btn-logout')?.addEventListener('click', () => {
        if (auth?.currentUser) {
            logout();
        } else {
            document.getElementById('authModal')?.classList.remove('hidden');
        }
    });

    document.getElementById('vw-btn')?.addEventListener('click', upgradeToWitnessTier);

    // Auth Modal
    const authModal = document.getElementById('authModal');
    document.getElementById('google-signin-btn')?.addEventListener('click', async () => {
        await googleLogin();
        authModal?.classList.add('hidden');
    });

    document.getElementById('email-signup-btn')?.addEventListener('click', async () => {
        const email = document.getElementById('email-input')?.value.trim();
        const password = document.getElementById('password-input')?.value.trim();
        if (email && password?.length >= 6) {
            try {
                const mod = await import('./auth.js');
                await mod.emailSignup(email, password);
                authModal?.classList.add('hidden');
            } catch (e) {}
        } else {
            showToast("Email and password (min 6 chars) required", "error");
        }
    });

    document.getElementById('email-login-btn')?.addEventListener('click', async () => {
        const email = document.getElementById('email-input')?.value.trim();
        const password = document.getElementById('password-input')?.value.trim();
        if (email && password) {
            try {
                const mod = await import('./auth.js');
                await mod.emailLogin(email, password);
                authModal?.classList.add('hidden');
            } catch (e) {}
        }
    });

    document.getElementById('close-auth-modal')?.addEventListener('click', () => {
        authModal?.classList.add('hidden');
    });

    // Highlight active feed button
    updateActiveFeedButton();
}

function updateActiveFeedButton() {
    document.getElementById('btn-witnessvoice')?.classList.toggle('active', currentFeed === 'witness-voice');
    document.getElementById('btn-citizentalk')?.classList.toggle('active', currentFeed === 'citizen-talk');
}
