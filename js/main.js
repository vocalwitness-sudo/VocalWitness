import './firebase-config.js';
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
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
    document.getElementById('moreMenu')?.classList.toggle('hidden');
};

window.challengeStewardAction = async (postId) => {
    if (!auth.currentUser) {
        return showToast("Please sign in to challenge", "error");
    }

    const tier = await getCurrentUserTier?.() || 'CITIZEN';
    if (tier === 'CITIZEN') {
        return showToast("Only verified members (Citizen Circle+) can challenge Steward actions", "error");
    }

    const reason = prompt("Why do you want to challenge this Steward action? (optional)");
    showToast("⚖️ Challenge submitted. The community will review this action.", "success");
    console.log(`Challenge submitted for post ${postId} by ${auth.currentUser.uid}`);
};

window.showProfile = () => {
    safeGetElement('profileModal')?.classList.remove('hidden');
};

window.closeProfile = () => {
    safeGetElement('profileModal')?.classList.add('hidden');
};

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

    content.innerHTML = `
        <div class="text-center px-6 py-4">
            <h2 class="text-2xl font-bold text-white mb-3">Build the Square Together</h2>
            <p class="text-emerald-400 mb-6 text-sm">Every contribution helps strengthen our decentralized public square.<br>Stewardship is earned through honest participation.</p>
            
            <div class="space-y-3 text-left">
                <button onclick="startContribution('testimony')" class="w-full bg-zinc-800 hover:bg-emerald-900 border border-emerald-600 text-white py-4 px-5 rounded-2xl transition-all flex justify-between items-center">
                    <span>📝 Share Testimony in Citizen Talk</span>
                    <span class="text-xs text-emerald-400">+15 rep</span>
                </button>
                
                <button onclick="startContribution('forensic')" class="w-full bg-zinc-800 hover:bg-emerald-900 border border-emerald-600 text-white py-4 px-5 rounded-2xl transition-all flex justify-between items-center">
                    <span>🛡️ Photo + Forensic Shield</span>
                    <span class="text-xs text-emerald-400">+10 rep</span>
                </button>
                
                <button onclick="startContribution('voice')" class="w-full bg-zinc-800 hover:bg-emerald-900 border border-emerald-600 text-white py-4 px-5 rounded-2xl transition-all flex justify-between items-center">
                    <span>🎤 Voice Testimony</span>
                    <span class="text-xs text-emerald-400">+12 rep</span>
                </button>
                
                <button onclick="startContribution('zk')" class="w-full bg-amber-900 hover:bg-amber-800 border border-amber-500 text-amber-300 py-4 px-5 rounded-2xl transition-all">
                    🔐 Advance in Witness Circle (ZK Verification)
                </button>
                
                <button onclick="startContribution('donate')" class="w-full bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 text-white py-4 px-5 rounded-2xl transition-all flex justify-between items-center">
                    <span>💚 Voluntary Financial Support</span>
                    <span class="text-xs text-emerald-400">Help sustain the Square</span>
                </button>
            </div>
            
            <button onclick="closeSupportModal()" class="mt-8 text-zinc-400 hover:text-white text-sm font-medium">
                Close
            </button>
        </div>
    `;
}

window.startContribution = (type) => {
    window.closeSupportModal();
    
    if (type === 'testimony') {
        safeGetElement('mainInput')?.focus();
        showToast("Share your testimony — this builds your Witness reputation", "success");
    } else if (type === 'forensic' || type === 'voice') {
        showToast(`Opening ${type} contribution...`, "info");
    } else if (type === 'zk') {
        showToast("Starting ZK Verification path...", "success");
        setTimeout(() => window.location.href = 'true-witness.html', 700);
    } else if (type === 'donate') {
        showToast("Thank you! Voluntary support link coming soon.", "success");
    }
};

window.closeSupportModal = () => {
    safeGetElement('supportModal')?.classList.add('hidden');
};

window.initiateStewardship = window.showSupportModal;

// ====================== GROUP FUNCTIONS ======================
window.showGroupModal = () => {
    safeGetElement('groupModal')?.classList.remove('hidden');
};

window.closeGroupModal = () => {
    safeGetElement('groupModal')?.classList.add('hidden');
};

window.createGroup = async () => {
    const name = safeGetElement('groupName')?.value.trim() || '';
    const desc = safeGetElement('groupDesc')?.value.trim() || '';
    
    if (!name) return showToast("Group name is required", "error");

    try {
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        await addDoc(collection(db, "groups"), {
            name,
            description: desc,
            createdBy: auth.currentUser?.uid,
            createdAt: new Date().toISOString(),
            members: [auth.currentUser?.uid],
            memberCount: 1
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
        postBtn.disabled = false;
        postBtn.textContent = '🚀 Publish Testimony to the Square';
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

    const success = await sendPhoneVerification?.(phone);
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

    const success = await verifyPhoneCode?.(code);
    if (success) window.closePhoneModal?.();
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

    const profileBtn = safeGetElement('profile-btn');
    if (profileBtn) profileBtn.addEventListener('click', window.showProfile);

    safeGetElement('moreMenu')?.classList.add('hidden');
});

// Optional helper
window.registerGlobalFunctions?.({
    publishTestimony: window.publishTestimony,
    loadFeed: window.loadFeed,
    showSupportModal: window.showSupportModal
});
