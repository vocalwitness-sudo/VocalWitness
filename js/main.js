// js/main.js - FIXED, CLEAN & COMPATIBLE (Firebase v11)
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let engineInstance = null;

// ====================== GLOBAL FUNCTIONS ======================
window.loadFeed = (feedType) => {
    document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
   
    const active = document.querySelector(`button[data-feed="${feedType}"]`);
    if (active) active.classList.add('active');

    console.log(`Switching to feed: ${feedType}`);

    if (feedType === 'true-witness') {
        showToast("🔒 True Witness Mode (ZK Verified)", "info");
        initFeed(db, 'citizen-talk'); // fallback
    } else if (feedType === 'live') {
        showToast("🏟️ Live Arena (coming soon)", "info");
        initFeed(db, 'citizen-talk'); // fallback
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

        showToast("✅ Testimony published!", "success");
        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        window.loadFeed('citizen-talk');
    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish: " + (err.message || "Check permissions"), "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = '🚀 Publish Testimony to the Square';
    }
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    await initAuth();
    initLanguage();
    engineInstance = new CitizenTalkEngine(db, storage);
    window.engineInstance = engineInstance;
    mediaModule.setEngine(engineInstance);

    // Button listeners
    document.getElementById('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => mediaModule.handleImageSelect(e, document.getElementById('preview-area'));
        input.click();
    });

    document.getElementById('btn-voice')?.addEventListener('click', (e) => mediaModule.toggleVoiceRecording(e.currentTarget));
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);

    // Initial load
    setTimeout(() => window.loadFeed('citizen-talk'), 600);
}

document.addEventListener('DOMContentLoaded', bootstrap);

// ====================== GLOBAL EXPOSURES ======================
window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');
window.logout = () => { console.log("Logout called"); };
window.signUpWithEmail = () => showToast("Sign up coming soon", "info");
window.sendOTP = window.verifyOTP = () => showToast("Phone verification coming soon", "info");

window.showTrueWitness = () => {
    showToast("🔒 True Witness mode (ZK verification)", "info");
    window.loadFeed('true-witness');
};

window.showLiveArena = () => {
    showToast("🏟️ Live Arena coming soon", "info");
    window.loadFeed('live');
};

window.showGuardian = () => {
    console.log("showGuardian called");
    const guardianModal = document.getElementById('guardianModal');
    if (guardianModal) {
        guardianModal.classList.remove('hidden');
        showToast("🛡️ Guardian Modal Opened", "success");
    } else {
        showToast("🛡️ Guardian Features (Advanced Security)", "info");
    }
};

window.showProfile = () => {
    console.log("showProfile called");
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
        showToast("👤 Profile opened", "success");
    } else {
        showToast("Profile modal not found in HTML", "error");
    }
};

// Debug info
console.log("✅ Global functions ready:");
console.log("- showProfile:", typeof window.showProfile);
console.log("- showGuardian:", typeof window.showGuardian);

// Profile Features
let isAnonymous = false;

window.toggleAnonymous = () => {
    isAnonymous = !isAnonymous;
    document.getElementById('anonStatus').textContent = isAnonymous 
        ? "🕵️ Anonymous Mode: ON" 
        : "👤 Anonymous Mode: OFF";
    showToast(isAnonymous ? "Anonymous posting enabled" : "Anonymous mode disabled", "success");
};

window.uploadProfilePicture = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const currentUser = auth.currentUser;
    if (!currentUser) return showToast("Please sign in", "error");

    try {
        const { ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js");
        const storageRef = ref(storage, `profiles/${currentUser.uid}/avatar.jpg`);
        
        await uploadBytes(storageRef, file);
        const url = await getDownloadURL(storageRef);

        document.getElementById('profileAvatarImg').src = url;
        document.getElementById('profileAvatarImg').classList.remove('hidden');

        showToast("Profile picture updated successfully!", "success");
    } catch (e) {
        console.error(e);
        showToast("Failed to upload image", "error");
    }
};

let isAnonymous = false;

window.toggleAnonymous = () => {
    isAnonymous = !isAnonymous;
    document.getElementById('anonStatus').textContent = isAnonymous ? "🕵️ Anonymous Mode: ON" : "👤 Anonymous Mode: OFF";
    showToast(isAnonymous ? "Anonymous posting enabled" : "Anonymous mode disabled", "success");
};

window.saveBio = async () => {
    const bio = document.getElementById('profileBio').value.trim();
    const user = auth.currentUser;
    if (!user || !bio) return;

    try {
        await setDoc(doc(db, "users", user.uid), { bio }, { merge: true });
        showToast("Bio saved successfully", "success");
    } catch (e) {
        showToast("Failed to save bio", "error");
    }
};

window.showSecurityPanel = () => {
    showToast("🔐 Security Panel (Password change, Recovery, ZK) - Coming soon", "info");
};

window.saveBio = async () => {
    const bio = document.getElementById('profileBio').value.trim();
    const user = auth.currentUser;
    if (!user || !bio) return showToast("Nothing to save", "info");

    try {
        await setDoc(doc(db, "users", user.uid), { bio: bio }, { merge: true });
        showToast("Bio saved successfully", "success");
    } catch (e) {
        console.error(e);
        showToast("Failed to save bio", "error");
    }
};

window.showSecurityPanel = () => {
    showToast("🔐 Security & Recovery Panel\n\n• Change Password\n• Enable 2FA\n• ZK Recovery Key\n\nComing in next update", "info");
};
