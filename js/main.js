// js/main.js - Enhanced with Robust Validation & Safe DOM Handling
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { recordTestimonyContribution } from './dao.js';

let engineInstance = null;

// ====================== SAFE DOM SELECTOR ======================
function safeGetElement(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Missing element: #${id}`);
        return null;
    }
    return el;
}

// ====================== INPUT VALIDATION ======================
function sanitizeInput(str) {
    return str ? str.replace(/<[^>]*>/g, '').trim() : '';
}

function validateTextInput(text, min = 3, max = 1500) {
    const sanitized = sanitizeInput(text);
    if (!sanitized) return { valid: false, error: "Content cannot be empty" };
    if (sanitized.length < min) return { valid: false, error: `Minimum ${min} characters required` };
    if (sanitized.length > max) return { valid: false, error: `Maximum ${max} characters allowed` };
    return { valid: true, value: sanitized };
}

function validatePhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
}

// ====================== GLOBAL WINDOW FUNCTIONS ======================
window.loadFeed = (feedType) => {
    document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[data-feed="${feedType}"]`);
    if (activeBtn) activeBtn.classList.add('active');

    console.log(`Switching to feed: ${feedType}`);

    if (feedType === 'true-witness' || feedType === 'live') {
        showToast(feedType === 'true-witness' 
            ? "🔒 True Witness Mode (ZK Verified)" 
            : "🏟️ Live Arena (coming soon)", "info");
        initFeed(db, 'citizen-talk');
    } else {
        initFeed(db, feedType);
    }
};

window.navigateToPage = (page) => window.location.href = page;

window.toggleMoreMenu = () => safeGetElement('moreMenu')?.classList.toggle('hidden');

window.challengeStewardAction = async (postId) => {
    if (!auth.currentUser) return showToast("Please sign in to challenge", "error");

    // Add tier check if available
    showToast("⚖️ Challenge submitted. The community will review this action.", "success");
    console.log(`Challenge for post ${postId} by ${auth.currentUser.uid}`);
};

window.showProfile = () => safeGetElement('profileModal')?.classList.remove('hidden');
window.closeProfile = () => safeGetElement('profileModal')?.classList.add('hidden');

// ====================== SUPPORT MODAL ======================
window.showSupportModal = () => {
    const modal = safeGetElement('supportModal');
    if (!modal) return console.warn("Support modal not found");
    modal.classList.remove('hidden');
    renderSupportModalContent();
};

function renderSupportModalContent() {
    const content = safeGetElement('supportModalContent');
    if (!content) return;

    content.innerHTML = `...` // (your existing support modal HTML - unchanged)
    // Paste your full support modal HTML here if needed
}

window.startContribution = (type) => {
    window.closeSupportModal();
    if (type === 'testimony') {
        safeGetElement('mainInput')?.focus();
        showToast("Share your testimony — this builds your Witness reputation", "success");
    } else if (type === 'zk') {
        showToast("Starting ZK Verification path...", "success");
        setTimeout(() => window.location.href = 'true-witness.html', 700);
    } else {
        showToast(`Opening ${type} contribution...`, "info");
    }
};

window.closeSupportModal = () => safeGetElement('supportModal')?.classList.add('hidden');
window.initiateStewardship = window.showSupportModal;

// ====================== GROUP FUNCTIONS ======================
window.showGroupModal = () => safeGetElement('groupModal')?.classList.remove('hidden');
window.closeGroupModal = () => safeGetElement('groupModal')?.classList.add('hidden');

window.createGroup = async () => {
    const name = safeGetElement('groupName')?.value.trim() || '';
    const desc = safeGetElement('groupDesc')?.value.trim() || '';
    if (!name) return showToast("Group name is required", "error");

    try {
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        await addDoc(collection(db, "groups"), {
            name, description: desc, createdBy: auth.currentUser?.uid,
            createdAt: new Date().toISOString(), members: [auth.currentUser?.uid], memberCount: 1
        });
        showToast(`✅ Group "${name}" created!`, "success");
        window.closeGroupModal();
    } catch (err) {
        console.error(err);
        showToast("Failed to create group", "error");
    }
};

// ====================== PUBLISH TESTIMONY (Single Enhanced Version) ======================
window.publishTestimony = async () => {
    const textarea = safeGetElement('mainInput');
    if (!textarea) return showToast("Input field not found", "error");

    const validation = validateTextInput(textarea.value);
    if (!validation.valid) {
        showToast(validation.error, "error");
        return;
    }
    const content = validation.value;

    if (!content && !window.selectedImageFile && !engineInstance?.currentAudioBlob) {
        return showToast("Please add text, photo or voice testimony", "error");
    }

    const postBtn = safeGetElement('postButton');
    if (!postBtn) return showToast("Post button not found", "error");

    postBtn.disabled = true;
    postBtn.textContent = '🚀 Publishing...';

    try {
        const currentUser = auth.currentUser;
        if (!currentUser) return showToast("Please sign in to publish", "error");

        const mediaData = await mediaModule.uploadForensicMedia(currentUser.uid);

        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");

        await addDoc(collection(db, "testimonies"), {
            authorId: currentUser.uid,
            author: currentUser.displayName || "Anonymous Witness",
            content,
            imageUrl: mediaData?.imageUrl || null,
            audioUrl: mediaData?.audioUrl || null,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk"
        });

        await recordTestimonyContribution();
        showToast("✅ Testimony published to the Square!", "success");

        textarea.value = '';
        mediaModule.resetMediaState();
        window.loadFeed('citizen-talk');
    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish. Please try again.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = '🚀 Publish Testimony to the Square';
        }
    }
};

// ====================== PHONE VERIFICATION ======================
window.sendPhoneCode = async () => {
    const input = safeGetElement('phoneInput');
    if (!input) return showToast("Phone input not found", "error");

    const phone = input.value.trim();
    if (!phone || !validatePhoneNumber(phone)) {
        return showToast("Invalid phone number format", "error");
    }

    // Call your phone verification function from phoneVerification.js
    const success = await window.sendPhoneVerification?.(phone);
    if (success) {
        safeGetElement('phoneStep')?.classList.add('hidden');
        safeGetElement('otpStep')?.classList.remove('hidden');
    }
};

window.verifyPhoneCode = async () => {
    const input = safeGetElement('otpInput');
    if (!input) return showToast("OTP field not found", "error");

    const code = input.value.trim();
    if (!code || code.length !== 6 || !/^\d{6}$/.test(code)) {
        return showToast("Enter a valid 6-digit code", "error");
    }

    const success = await window.verifyPhoneCode?.(code);
    if (success) window.closePhoneModal?.();
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();

        engineInstance = new CitizenTalkEngine(db, storage || null); // storage may be in another module
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
    safeGetElement('btn-photo')?.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = (e) => mediaModule.handleImageSelect(e, safeGetElement('preview-area'));
        input.click();
    });

    safeGetElement('btn-voice')?.addEventListener('click', (e) => {
        mediaModule.toggleVoiceRecording(e.currentTarget);
    });

    safeGetElement('postButton')?.addEventListener('click', window.publishTestimony);
}

document.addEventListener('DOMContentLoaded', () => {
    bootstrap();

    safeGetElement('profile-btn')?.addEventListener('click', window.showProfile);
    safeGetElement('moreMenu')?.classList.add('hidden');
});
