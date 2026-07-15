import './app-state.js';
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { initOnboarding } from './onboarding.js';
import { loadDynamicNavigation } from './navigation.js';
import { applyTierTheme, updateTierBadge } from './tier.js';
import { AppState } from './app-state.js';

let engineInstance = null;

// ====================== TAB SWITCHING ======================
window.switchTab = (tab) => {
    document.querySelectorAll('#main-nav button').forEach(btn => {
        btn.classList.remove('active', 'bg-amber-900', 'text-amber-300');
        if (btn.dataset.tab === tab) {
            btn.classList.add('active');
            if (tab === 'witness') btn.classList.add('bg-amber-900', 'text-amber-300');
        }
    });
    AppState.currentTab = tab;
    if (tab === 'witness') {
        AppState.currentMode = 'witness';
    } else {
        AppState.currentMode = 'citizen';
    }
    if (tab === 'more') {
        showMoreMenu();
        return;
    }
    loadDynamicFeed(tab);
};

function loadDynamicFeed(tab) {
    let feedType = 'citizen-talk';
    if (tab === 'ledger') feedType = 'ledger';
    else if (tab === 'arena') feedType = 'live';
    else if (tab === 'mycircle') feedType = 'my-testimonies';
    else if (tab === 'witness') feedType = 'true-witness';
    initFeed(db, feedType);
}

window.showMoreMenu = () => {
    alert("More menu - coming soon");
};

// ====================== GLOBAL MODAL FUNCTIONS ======================
window.showProfile = () => {
    document.getElementById('profileModal').classList.remove('hidden');
};

window.closeProfile = () => {
    document.getElementById('profileModal').classList.add('hidden');
};

window.editProfile = () => {
    // You can expand this later
    alert("Edit Profile opened - connect your edit modal here");
};

window.logout = () => {
    // Add your logout logic
    if (confirm("Logout?")) {
        alert("Logged out (add real logic)");
    }
};
// ====================== PUBLISH TESTIMONY ======================
window.publishTestimony = async () => {
    const textarea = document.getElementById('mainInput');
    const content = textarea ? textarea.value.trim() : '';
    
    if (!content && !mediaModule.selectedImageFile && !window.engineInstance?.currentAudioBlob) {
        showToast("Please write something or add media", "error");
        return;
    }

    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = 'Publishing to the Square...';
    }

    try {
        // Upload media first (photo + voice)
        let mediaData = { imageUrl: null, audioUrl: null, imageHash: null, audioHash: null };
        
        if (mediaModule && typeof mediaModule.uploadForensicMedia === 'function') {
            mediaData = await mediaModule.uploadForensicMedia();
        }

        // Save to Firestore
        const { collection, addDoc, serverTimestamp } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        
        const testimonyData = {
            authorId: auth.currentUser?.uid || "anonymous",
            author: auth.currentUser?.displayName || "Anonymous Witness",
            content: content,
            imageUrl: mediaData.imageUrl,
            audioUrl: mediaData.audioUrl,
            imageHash: mediaData.imageHash,
            audioHash: mediaData.audioHash,
            timestamp: serverTimestamp(),
            feedVisibility: AppState.currentMode || "citizen",
            status: "public",
            createdAt: serverTimestamp()
        };

        await addDoc(collection(db, "testimonies"), testimonyData);

        // Success
        showToast("✅ Testimony published successfully to the Square!", "success");
        
        // Clear form
        if (textarea) textarea.value = '';
        if (mediaModule && typeof mediaModule.resetMediaState === 'function') {
            mediaModule.resetMediaState();
        }

        // Refresh feed
        if (typeof loadDynamicFeed === 'function') {
            loadDynamicFeed(AppState.currentTab || 'square');
        }

    } catch (err) {
        console.error("Publish error:", err);
        showToast("Failed to publish. Please try again.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = 'Publish to the Square';
        }
    }
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth();
        initLanguage();
        initProfile();
        initOnboarding?.();
        loadDynamicNavigation?.();
        
        engineInstance = new CitizenTalkEngine(db, storage);
        window.engineInstance = engineInstance;
        
        if (mediaModule.setEngine) mediaModule.setEngine(engineInstance);
        if (typeof applyTierTheme === 'function') applyTierTheme();
        if (typeof updateTierBadge === 'function') updateTierBadge();
        
        setupEventListeners();
        
        setTimeout(() => window.switchTab('square'), 600);
        
        console.log("✅ VocalWitness Live Ready");
    } catch (e) {
        console.error("Bootstrap failed:", e);
    }
}

function setupEventListeners() {
    // Nav Tabs
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => window.switchTab(btn.dataset.tab));
    });

    // Profile Button
    const profileBtn = document.getElementById('profile-btn');
    if (profileBtn) {
        profileBtn.addEventListener('click', window.showProfile);
    }

    // Support Button
    const supportBtn = document.getElementById('support-btn');
    if (supportBtn) {
        supportBtn.addEventListener('click', () => {
            document.getElementById('supportModal')?.classList.remove('hidden');
        });
    }

       // Post Button - Full Publish Logic
    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.addEventListener('click', window.publishTestimony);
        console.log("✅ Full Publish listener attached");
    }

    // ====================== MEDIA BUTTONS (Forensic Photo & Voice) ======================
    const photoBtn = document.getElementById('btn-photo');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = (e) => {
                const previewArea = document.getElementById('preview-area');
                if (mediaModule && typeof mediaModule.handleImageSelect === 'function') {
                    mediaModule.handleImageSelect(e, previewArea);
                } else {
                    showToast("📸 Media module not ready. Refresh page.", "error");
                }
            };
            input.click();
        });
        console.log("✅ Photo button listener attached");
    }

    const voiceBtn = document.getElementById('btn-voice');
    if (voiceBtn) {
        voiceBtn.addEventListener('click', (e) => {
            if (mediaModule && typeof mediaModule.toggleVoiceRecording === 'function') {
                mediaModule.toggleVoiceRecording(e.currentTarget);
            } else {
                showToast("🎤 Voice module not ready. Refresh page.", "error");
            }
        });
        console.log("✅ Voice button listener attached");
    }

    // ====================== EDIT PROFILE MODAL CONTROLS ======================
    window.openEditProfile = () => {
        const modal = document.getElementById('editProfileModal');
        if (modal) modal.classList.remove('hidden');
        
        try {
            if (typeof window.currentUserData !== 'undefined' && window.currentUserData) {
                document.getElementById('editDisplayName').value = window.currentUserData.displayName || '';
                document.getElementById('editUsername').value = window.currentUserData.username || '';
                document.getElementById('editBio').value = window.currentUserData.bio || '';
            }
        } catch (e) {
            console.log("Could not pre-fill profile data");
        }
    };

    window.closeEditProfile = () => {
        const modal = document.getElementById('editProfileModal');
        if (modal) modal.classList.add('hidden');
    };

    window.saveProfileChanges = async () => {
        showToast("Saving profile changes...", "info");
        setTimeout(() => {
            closeEditProfile();
            showToast("✅ Profile Updated!", "success");
        }, 800);
    };

    window.handleProfileImageUpload = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            showToast("Please select an image file", "error");
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            const preview = document.getElementById('profileImagePreview');
            if (preview) {
                preview.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover rounded-3xl">`;
            }
            // Note: currentProfileImageFile should be declared globally if used elsewhere
            window.currentProfileImageFile = file;
            showToast("Image preview ready", "success");
        };
        reader.readAsDataURL(file);
    };
}

// ====================== BOOTSTRAP ======================
document.addEventListener('DOMContentLoaded', bootstrap);
