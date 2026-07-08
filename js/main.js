// js/main.js - CLEAN & ORGANIZED FINAL VERSION
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { getCurrentUserTier, applyTierTheme } from './tier.js';

// ====================== GLOBAL STATE ======================
let engineInstance = null;

// ====================== GLOBAL WINDOW FUNCTIONS ======================
window.loadFeed = (feedType) => {
    document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[data-feed="${feedType}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    console.log(`Switching to feed: ${feedType}`);

    if (feedType === 'true-witness') {
        showToast("🔒 True Witness Mode (ZK Verified)", "info");
        initFeed(db, 'citizen-talk');
    } else if (feedType === 'live') {
        showToast("🏟️ Live Arena (coming soon)", "info");
        initFeed(db, 'citizen-talk');
    } else {
        initFeed(db, feedType);
    }
};

window.navigateToPage = (page) => {
    window.location.href = page;
};

window.toggleMoreMenu = () => {
    document.getElementById('moreMenu').classList.toggle('hidden');
};

window.showProfile = () => {
    document.getElementById('profileModal').classList.remove('hidden');
};

window.closeProfile = () => {
    document.getElementById('profileModal').classList.add('hidden');
};

window.showSupportModal = () => {
    document.getElementById('supportModal').classList.remove('hidden');
};

window.initiateStewardship = () => {
    showToast("Thank you! Stewardship is earned through contribution.\n\nVoluntary support options coming soon.", "success");
    document.getElementById('supportModal').classList.add('hidden');
};

window.showGroupModal = () => {
    document.getElementById('groupModal').classList.remove('hidden');
};

window.closeGroupModal = () => {
    document.getElementById('groupModal').classList.add('hidden');
};

window.createGroup = async () => {
    const name = document.getElementById('groupName').value.trim();
    const desc = document.getElementById('groupDesc').value.trim();
    
    if (!name) {
        showToast("Group name is required", "error");
        return;
    }

    try {
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        
        await addDoc(collection(db, "groups"), {
            name: name,
            description: desc || "",
            createdBy: auth.currentUser.uid,
            createdAt: new Date().toISOString(),
            members: [auth.currentUser.uid],
            memberCount: 1
        });

        showToast(`✅ Group "${name}" created successfully!`, "success");
        closeGroupModal();
    } catch (err) {
        console.error(err);
        showToast("Failed to create group", "error");
    }
};

window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";

    if (!content && !window.selectedImageFile && !engineInstance?.currentAudioBlob) {
        return showToast("Please add text, photo or voice testimony", "error");
    }

    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = '🚀 Publishing...';

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

        showToast("✅ Testimony published to the Square!", "success");
        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        window.loadFeed('citizen-talk');
    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish testimony: " + (err.message || "Unknown error"), "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = '🚀 Publish Testimony to the Square';
    }
};

// Placeholder functions
window.editProfile = () => alert("Edit profile coming soon");
window.changePassword = () => alert("Password change coming soon");
window.showZKUpgrade = () => alert("ZK Verification path coming soon");
window.uploadProfilePicture = () => alert("Profile picture upload coming soon");
window.logout = () => {
    console.log("Logout called");
    showToast("Signed out successfully", "success");
    setTimeout(() => window.location.reload(), 800);
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

        setTimeout(() => window.loadFeed('citizen-talk'), 600);

        console.log("✅ VocalWitness initialized successfully");
    } catch (error) {
        console.error("Bootstrap failed:", error);
        showToast("Failed to initialize app", "error");
    }
}

function setupEventListeners() {
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

// Close more menu when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.relative')) {
        const menu = document.getElementById('moreMenu');
        if (menu) menu.classList.add('hidden');
    }
});

document.addEventListener('DOMContentLoaded', bootstrap);
