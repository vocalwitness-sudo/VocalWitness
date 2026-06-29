// js/main.js - FULL CLEAN & WORKING VERSION
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording, uploadForensicMedia, resetMediaState } from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let engineInstance = null;
let currentUser = null;

// ====================== ENGINE ======================
function initEngine() {
    if (!engineInstance) {
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        import('./media.js').then(m => m.setEngine(engineInstance));
        console.log("✅ Engine initialized");
    }
}

// ====================== PUBLISH ======================
window.publishTestimony = async () => {
    if (!currentUser) {
        showToast("Please sign in with Google first", "error");
        return;
    }

    const textarea = document.getElementById('mainInput');
    const content = textarea?.value.trim() || "";

    if (!content && !window.selectedImageFile && !engineInstance?.currentAudioBlob) {
        showToast("Please add text, photo, or voice", "error");
        return;
    }

    const postBtn = document.getElementById('postButton');
    postBtn.disabled = true;
    postBtn.textContent = '🚀 Publishing...';

    try {
        const mediaData = await uploadForensicMedia(currentUser.uid);

        await addDoc(collection(db, "testimonies"), {
            author: currentUser.displayName || "Anonymous Witness",
            authorId: currentUser.uid,
            content: content,
            imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk",
            likes: 0,
            disputes: 0
        });

        showToast("✅ Testimony published successfully!", "success");

        if (textarea) textarea.value = '';
        resetMediaState();

    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = '🚀 Publish Testimony to the Square';
    }
};

// ====================== FEED ======================
window.loadFeed = (feedType) => {
    console.log("🔄 Loading feed:", feedType);
    document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[data-feed="${feedType}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    initFeed(db, feedType);
};

// ====================== UI LISTENERS ======================
function attachUIListeners() {
    console.log("👂 UI Listeners Attached");

    document.getElementById('btn-profile')?.addEventListener('click', window.showProfileSection);
    document.getElementById('btn-guardian')?.addEventListener('click', () => document.getElementById('guardianModal')?.classList.remove('hidden'));
    document.getElementById('btn-close-guardian')?.addEventListener('click', () => document.getElementById('guardianModal')?.classList.add('hidden'));

    // Photo
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => handleImageSelect(e, document.getElementById('preview-area'));
            input.click();
        });
    }

    // Voice
    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) voiceBtn.addEventListener('click', (e) => toggleVoiceRecording(e.currentTarget));

    // Publish
    document.getElementById('postButton')?.addEventListener('click', window.publishTestimony);
}

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    console.log("🚀 Initializing VocalWitness...");
    try {
        await initAuth();
        initLanguage();
        initEngine();
        attachUIListeners();
        setTimeout(() => window.loadFeed('citizen-talk'), 800);
        console.log("✅ VocalWitness Loaded Successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
    }
}

document.addEventListener('DOMContentLoaded', bootstrap);
window.signUpWithEmail = async () => {
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;

    if (!email || !password) {
        showToast("Please fill all fields", "error");
        return;
    }

    try {
        const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js");
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        showToast("Account created successfully!", "success");
        window.closeSignupModal();
        // Auto login
        currentUser = userCredential.user;
    } catch (error) {
        showToast(error.message, "error");
    }
};

window.closeSignupModal = () => {
    document.getElementById('signupModal').classList.add('hidden');
};

// Show signup modal from somewhere (e.g., a "Sign Up" button)
window.showSignupModal = () => {
    document.getElementById('signupModal').classList.remove('hidden');
};
window.sendOTP = async () => {
    const phone = document.getElementById('phoneInput').value.trim();
    if (!phone) return showToast("Enter phone number", "error");
    
    const { sendPhoneVerification } = await import('./phoneVerification.js');
    await sendPhoneVerification(phone, currentUser?.uid);
};

window.verifyOTP = async () => {
    const code = document.getElementById('otpInput').value.trim();
    if (!code) return;
    
    const { verifyPhoneCode } = await import('./phoneVerification.js');
    await verifyPhoneCode(code);
};
// Example in upgrade flow
document.getElementById('phoneVerificationModal').classList.remove('hidden');

// Global Helpers
window.showProfileSection = () => document.getElementById('profileModal')?.classList.remove('hidden');
window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');
