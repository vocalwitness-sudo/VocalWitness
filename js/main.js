// js/main.js - CLEAN & ORGANIZED FINAL VERSION
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
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
};

// ====================== SUPPORT MODAL - FINAL (No Buying) ======================
window.showSupportModal = () => {
    const modal = document.getElementById('supportModal');
    if (!modal) return console.warn("Support modal not found");
    
    modal.classList.remove('hidden');
    renderSupportModalContent();
};

function renderSupportModalContent() {
    const content = document.getElementById('supportModalContent');
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
    closeSupportModal();
    
    if (type === 'testimony') {
        const input = document.getElementById('mainInput');
        if (input) input.focus();
        showToast("Share your testimony — this builds your Witness reputation", "success");
    } else if (type === 'forensic' || type === 'voice') {
        showToast(`Opening ${type} contribution...`, "info");
    } else if (type === 'zk') {
        showToast("Starting ZK Verification path...", "success");
        setTimeout(() => window.location.href = 'true-witness.html', 700);
    }
};

window.closeSupportModal = () => {
    const modal = document.getElementById('supportModal');
    if (modal) modal.classList.add('hidden');
};

// Link old function to new modal
window.initiateStewardship = window.showSupportModal;

// ====================== GROUP FUNCTIONS ======================
window.showGroupModal = () => {
    document.getElementById('groupModal').classList.remove('hidden');
};

window.closeGroupModal = () => {
    document.getElementById('groupModal').classList.add('hidden');
};

window.createGroup = async () => {
    const name = document.getElementById('groupName').value.trim();
    const desc = document.getElementById('groupDesc').value.trim();
    
    if (!name) return showToast("Group name is required", "error");

    try {
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        await addDoc(collection(db, "groups"), {
            name, description: desc || "", createdBy: auth.currentUser.uid,
            createdAt: new Date().toISOString(), members: [auth.currentUser.uid], memberCount: 1
        });
        showToast(`✅ Group "${name}" created!`, "success");
        closeGroupModal();
    } catch (err) {
        showToast("Failed to create group", "error");
    }
};

// ====================== PUBLISH TESTIMONY ======================
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
        if (!currentUser) return showToast("Please sign in to publish", "error");

        const mediaData = await mediaModule.uploadForensicMedia(currentUser.uid);
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");

        await addDoc(collection(db, "testimonies"), {
            authorId: currentUser.uid,
            author: currentUser.displayName || "Anonymous Witness",
            content, imageUrl: mediaData.imageUrl || null,
            audioUrl: mediaData.audioUrl || null,
            timestamp: new Date().toISOString(),
            feedVisibility: "citizen-talk"
        });

        await recordTestimonyContribution();   // Earn reputation

        showToast("✅ Testimony published to the Square!", "success");
        if (textarea) textarea.value = '';
        mediaModule.resetMediaState();
        window.loadFeed('citizen-talk');
    } catch (err) {
        console.error(err);
        showToast("Failed to publish testimony", "error");
    } finally {
        postBtn.disabled = false;
        postBtn.textContent = '🚀 Publish Testimony to the Square';
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

document.addEventListener('DOMContentLoaded', () => {
    bootstrap();

    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) profileBtn.addEventListener('click', window.showProfile);

    const moreMenu = document.getElementById('moreMenu');
    if (moreMenu) moreMenu.classList.add('hidden');
});
