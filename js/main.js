// js/main.js - PRODUCTION READY - July 2026
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { recordTestimonyContribution } from './dao.js';

// ====================== GLOBAL STATE ======================
let engineInstance = null;

// ====================== DOOR SWITCHER ======================
window.showDoorSwitcher = function() {
    console.log("🚪 Door Switcher activated");
    
    const doorEl = document.querySelector("#current-door, [data-current-door], .current-door, #door-label");
    if (!doorEl) {
        showToast("Door system ready", "info");
        return;
    }

    const availableDoors = [
        "Public Square",
        "Citizen Talk", 
        "True Witness",
        "Live Arena",
        "Groups"
    ];
    
    let current = doorEl.textContent.trim();
    let currentIndex = availableDoors.indexOf(current);
    if (currentIndex === -1) currentIndex = 0;
    
    let nextIndex = (currentIndex + 1) % availableDoors.length;
    
    doorEl.textContent = availableDoors[nextIndex];
    doorEl.style.transition = "all 0.3s ease";
    
    showToast(`🚪 Now in ${availableDoors[nextIndex]}`, "success");

    // Load corresponding content
    if (availableDoors[nextIndex] === "Citizen Talk") {
        window.loadFeed ? window.loadFeed('citizen') : initFeed(db, 'citizen-talk');
    }
};

// ====================== GLOBAL WINDOW FUNCTIONS ======================
window.loadFeed = (feedType) => {
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    initFeed(db, feedType || 'citizen-talk');
};

window.navigateToPage = (page) => {
    window.location.href = page;
};

window.toggleMoreMenu = () => {
    const menu = document.getElementById('moreMenu');
    if (menu) menu.classList.toggle('hidden');
};

// ====================== PUBLISH TESTIMONY ======================
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
        if (!currentUser) return showToast("Please sign in", "error");

        const mediaData = await mediaModule.uploadForensicMedia(currentUser.uid);
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");

        await addDoc(collection(db, "testimonies"), {
            authorId: currentUser.uid,
            author: currentUser.displayName || "Anonymous Witness",
            content,
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk"
        });

        await recordTestimonyContribution();
        showToast("✅ Testimony published to the Square!", "success");

        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        window.loadFeed('citizen-talk');
    } catch (err) {
        console.error(err);
        showToast("Failed to publish", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = '🚀 Publish Testimony to the Square';
        }
    }
};

// ====================== SUPPORT MODAL ======================
window.showSupportModal = () => {
    const modal = document.getElementById('supportModal');
    if (!modal) return;
    modal.classList.remove('hidden');
};

window.closeSupportModal = () => {
    const modal = document.getElementById('supportModal');
    if (modal) modal.classList.add('hidden');
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();
        
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        mediaModule.setEngine(engineInstance);

        setupEventListeners();
        
        // Initial load
        setTimeout(() => window.loadFeed('citizen-talk'), 800);

        console.log("✅ VocalWitness Production Ready");
    } catch (error) {
        console.error("Bootstrap failed:", error);
        showToast("Failed to initialize", "error");
    }
}

function setupEventListeners() {
    // Photo & Voice buttons
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => mediaModule.handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', (e) => {
        mediaModule.toggleVoiceRecording(e.currentTarget);
    });

    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);
}

// ====================== INIT ======================
document.addEventListener('DOMContentLoaded', bootstrap);
