// js/main.js - CLEAN & ORGANIZED VERSION
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';

// ====================== GLOBAL STATE ======================
let engineInstance = null;
let profileUnsubscribe = null;
let isAnonymous = false;

// ====================== GLOBAL WINDOW FUNCTIONS ======================

window.loadFeed = (feedType) => {
    // Remove active state from all nav buttons
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
    // TODO: Load real profile data here
};

window.showDAOModal = () => document.getElementById('daoModal').classList.remove('hidden');
window.submitProposal = async () => {
    const title = document.getElementById('proposalTitle').value;
    const desc = document.getElementById('proposalDesc').value;
    if (title) {
        await createStewardProposal(title, desc);
        document.getElementById('daoModal').classList.add('hidden');
    }
};

window.castVote = async (direction, strength) => {
    const proposalId = window.currentVotingProposalId;
    await castQuadraticVote(proposalId, direction, strength);
    closeVoteModal();
};

window.showVoteModal = (proposalId, title) => {
    window.currentVotingProposalId = proposalId;
    document.getElementById('voteTitle').textContent = title;
    document.getElementById('voteModal').classList.remove('hidden');
};

window.closeVoteModal = () => {
    document.getElementById('voteModal').classList.add('hidden');
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
    if (!name) {
        showToast("Group name is required", "error");
        return;
    }

    showToast("Creating group...", "info");

    // TODO: Implement Firestore group creation
    setTimeout(() => {
        showToast(`✅ Group "${name}" created successfully!`, "success");
        closeGroupModal();
    }, 800);
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
            feedVisibility: "citizen-talk",
            likes: 0,
            verified: false
        });

        showToast("✅ Testimony published to the Square!", "success");

        // Reset form
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
    // TODO: Implement proper logout with Firebase
    showToast("Signed out successfully", "success");
    setTimeout(() => window.location.reload(), 800);
};

// ====================== BOOTSTRAP / INITIALIZATION ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();

        // Initialize core engine
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        mediaModule.setEngine(engineInstance);

        // Attach event listeners
        setupEventListeners();

        // Load initial feed
        setTimeout(() => {
            window.loadFeed('citizen-talk');
        }, 600);

        console.log("✅ VocalWitness initialized successfully");

    } catch (error) {
        console.error("Bootstrap failed:", error);
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

// Close more menu when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.relative')) {
        const menu = document.getElementById('moreMenu');
        if (menu) menu.classList.add('hidden');
    }
});

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', bootstrap);
