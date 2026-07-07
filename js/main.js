// js/main.js - FINAL CLEAN VERSION
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { initiatePlatformSupport } from './supporters.js';

let engineInstance = null;
let profileUnsubscribe = null;

// ====================== GLOBAL FUNCTIONS ======================
window.loadFeed = (feedType) => {
    // Update active nav
    document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[data-feed="${feedType}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    console.log(`Switching to feed: ${feedType}`);

    if (feedType === 'true-witness' || feedType === 'live') {
        showToast(feedType === 'true-witness' ? "🔒 True Witness Mode (ZK Verified)" : "🏟️ Live Arena (coming soon)", "info");
        initFeed(db, 'citizen-talk'); // fallback for now
    } else {
        initFeed(db, feedType);
    }
};

window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";
    
    if (!content && !window.selectedImageFile && !engineInstance?.currentAudioBlob) {
        return showToast("Please add text, photo or voice", "error");
    }

    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = '🚀 Publishing...';
    }

    try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            showToast("Please sign in to publish", "error");
            return;
        }

        const mediaData = await mediaModule.uploadForensicMedia(currentUser.uid);
        
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        
        await addDoc(collection(db, "testimonies"), {
            authorId: currentUser.uid,
            author: currentUser.displayName || "Anonymous Witness",
            content: content,
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk"
        });

        showToast("✅ Testimony published!", "success");
        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        window.loadFeed('citizen-talk');
    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish: " + (err.message || "Unknown error"), "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = '🚀 Publish Testimony to the Square';
        }
    }
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();

        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        mediaModule.setEngine(engineInstance);

        // Attach event listeners
        setupEventListeners();

        // Initial feed load with small delay to prevent layout shift
        setTimeout(() => {
            window.loadFeed('citizen-talk');
        }, 300);

    } catch (error) {
        console.error("Bootstrap error:", error);
        showToast("Failed to initialize app", "error");
    }
}

function setupEventListeners() {
    // Photo button
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => mediaModule.handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    // Voice button
    document.getElementById('btn-voice')?.addEventListener('click', (e) => {
        mediaModule.toggleVoiceRecording(e.currentTarget);
    });

    // Publish button
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);
}

// ====================== PROFILE & UTILITIES ======================
window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
    if (profileUnsubscribe) {
        profileUnsubscribe();
        profileUnsubscribe = null;
    }
};

window.showProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('hidden');
};

window.logout = () => {
    console.log("Logout called");
    // Add real logout logic here
};

window.initiatePlatformSupport = initiatePlatformSupport; // Make sure it's available globally

// Phone country selector
function initPhoneCountrySelector() {
    const selector = document.getElementById('countryCodeSelector');
    if (!selector) return;

    const countryCodes = [
        { code: "+234", name: "Nigeria", flag: "🇳🇬" },
        // ... other countries
    ];

    selector.innerHTML = countryCodes.map(item => 
        `<option value="${item.code}">${item.flag} ${item.code} (${item.name})</option>`
    ).join('');
    selector.value = "+234";
}

// Initialize everything
document.addEventListener('DOMContentLoaded', () => {
    bootstrap();
    initPhoneCountrySelector();
});

console.log("✅ VocalWitness main.js loaded successfully");
