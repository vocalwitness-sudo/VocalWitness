// js/main.js - CLEAN & ORGANIZED FINAL VERSION
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { createStewardProposal, castQuadraticVote } from './dao.js';
import { initGroups } from './group.js';
import { uploadForensicMedia, resetMediaState, handleImageSelect, toggleVoiceRecording, startForensicShield } from './media.js';

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

window.showSupportModal = () => {
    const modal = document.getElementById('supportModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
};

window.initiateStewardship = () => {
    showToast("Thank you! Stewardship is earned through contribution.\n\nVoluntary support options coming soon.", "success");
    document.getElementById('supportModal').classList.add('hidden');
};

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

// ====================== DAO VOTING ======================
window.showDAOModal = () => {
    document.getElementById('daoModal').classList.remove('hidden');
};

window.submitProposal = async () => {
    const title = document.getElementById('proposalTitle').value.trim();
    const desc = document.getElementById('proposalDesc').value.trim();
    
    if (!title) {
        showToast("Proposal title is required", "error");
        return;
    }

    try {
        const { collection, addDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        
        await addDoc(collection(db, "dao_proposals"), {
            title: title,
            description: desc || "",
            createdBy: auth.currentUser.uid,
            createdAt: new Date().toISOString(),
            status: "active",
            votesFor: 0,
            votesAgainst: 0,
            voters: []
        });

        showToast("Proposal submitted to Steward DAO", "success");
        document.getElementById('daoModal').classList.add('hidden');
    } catch (err) {
        console.error(err);
        showToast("Failed to create proposal", "error");
    }
};

window.castVote = async (direction, strength) => {
    // TODO: Implement quadratic voting logic here
    showToast(`Voted ${direction} with strength ${strength}`, "success");
    window.closeVoteModal();
};

window.showVoteModal = (proposalId, title) => {
    window.currentVotingProposalId = proposalId;
    document.getElementById('voteTitle').textContent = title;
    document.getElementById('voteModal').classList.remove('hidden');
};

window.closeVoteModal = () => {
    document.getElementById('voteModal').classList.add('hidden');
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

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize core system (Only once)
    bootstrap();

    // 2. Register UI listeners
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', window.showProfile);
    }
    
    const forensicBtn = document.getElementById('forensic-btn');
    if (forensicBtn) {
        // Use mediaModule.startForensicShield if it's imported, 
        // or just the function name if it's in the same scope
        forensicBtn.addEventListener('click', mediaModule.startForensicShield);
    }

    // 3. Register any other necessary UI listeners
    const moreMenu = document.getElementById('moreMenu');
    // Ensure the menu starts hidden
    if (moreMenu) moreMenu.classList.add('hidden');
});
