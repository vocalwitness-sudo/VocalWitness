// js/main.js - CLEAN & ORGANIZED
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import { handleImageSelect, toggleVoiceRecording, uploadForensicMedia, resetMediaState } from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './firebase-config.js';

let engineInstance = null;
let currentUser = null;

// ====================== ENGINE ======================
function initEngine() {
    if (!engineInstance) {
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        import('./media.js').then(m => m.setEngine(engineInstance));
    }
}

// ====================== PUBLISH ======================
window.publishTestimony = async () => {
    if (!currentUser) {
        showToast("Please sign in first", "error");
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

window.signUpWithEmailPassword = async () => {
    const email = document.getElementById('signupEmail')?.value.trim();
    const password = document.getElementById('signupPassword')?.value.trim();

    if (!email || !password || password.length < 6) {
        showToast("Please enter valid email and password", "error");
        return;
    }

    const { signUpWithEmail } = await import('./auth.js');
    const user = await signUpWithEmail(email, password);
    
    if (user) {
        currentUser = user;
        window.closeSignupModal();
        setTimeout(() => document.getElementById('phoneVerificationModal')?.classList.remove('hidden'), 1000);
    }
};


// ====================== UI LISTENERS ======================
function attachUIListeners() {
    console.log("👂 UI Listeners Attached");

    document.getElementById('btn-profile')?.addEventListener('click', window.showProfileSection);
    document.getElementById('btn-guardian')?.addEventListener('click', () => document.getElementById('guardianModal')?.classList.remove('hidden'));
    document.getElementById('btn-close-guardian')?.addEventListener('click', () => document.getElementById('guardianModal')?.classList.add('hidden'));

    // Photo & Voice
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

// ====================== EMAIL/PASSWORD SIGN UP ======================
window.showSignupModal = () => {
    document.getElementById('signupModal')?.classList.remove('hidden');
};

window.closeSignupModal = () => {
    document.getElementById('signupModal')?.classList.add('hidden');
};

window.signUpWithEmailPassword = async () => {
    const email = document.getElementById('signupEmail')?.value.trim();
    const password = document.getElementById('signupPassword')?.value.trim();

    if (!email || !password || password.length < 6) {
        showToast("Please enter valid email and password (min 6 characters)", "error");
        return;
    }

    try {
        const { createUserWithEmailAndPassword } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js");
        // Note: global 'auth' instance should be initialized/exported inside your auth.js setup
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        
        showToast("✅ Account created successfully! Welcome to Citizen Talk.", "success");
        currentUser = userCredential.user;
        window.closeSignupModal();
        
        // Auto trigger phone verification after successful sign up
        setTimeout(() => {
            document.getElementById('phoneVerificationModal')?.classList.remove('hidden');
        }, 1200);

    } catch (error) {
        console.error(error);
        showToast(error.message || "Sign up failed", "error");
    }
};

// ====================== PHONE VERIFICATION (OTP) ======================
window.sendOTP = async () => {
    const phone = document.getElementById('phoneInput')?.value.trim();
    if (!phone) return showToast("Enter phone number", "error");

    const { sendPhoneVerification } = await import('./phoneVerification.js');
    await sendPhoneVerification(phone, currentUser?.uid);
};

window.verifyOTP = async () => {
    const code = document.getElementById('otpInput')?.value.trim();
    if (!code) return showToast("Enter OTP code", "error");

    const { verifyPhoneCode } = await import('./phoneVerification.js');
    await verifyPhoneCode(code);
};

// Global Helpers
window.showProfileSection = () => document.getElementById('profileModal')?.classList.remove('hidden');
window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');
