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

    // Post Button (basic)
    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.addEventListener('click', () => {
            showToast("Publishing... (connect full logic)", "info");
        });
    }
   // Edit Profile Modal Controls
window.openEditProfile = () => {
    const modal = document.getElementById('editProfileModal');
    if (modal) modal.classList.remove('hidden');
   
    // Safer pre-fill (avoid scope error)
    try {
        if (typeof currentUserData !== 'undefined' && currentUserData) {
            document.getElementById('editDisplayName').value = currentUserData.displayName || '';
            document.getElementById('editUsername').value = currentUserData.username || '';
            document.getElementById('editBio').value = currentUserData.bio || '';
        }
    } catch (e) {
        console.log("Could not pre-fill profile data");
    }
};

window.closeEditProfile = () => {
    document.getElementById('editProfileModal').classList.add('hidden');
};
// ====================== EDIT PROFILE MODAL CONTROLS ======================
// ====================== EDIT PROFILE MODAL CONTROLS ======================
window.openEditProfile = () => {
    const modal = document.getElementById('editProfileModal');
    if (modal) modal.classList.remove('hidden');
    
    // Pre-fill form if user data exists
    if (typeof currentUserData !== 'undefined' && currentUserData) {
        document.getElementById('editDisplayName').value = currentUserData.displayName || '';
        document.getElementById('editUsername').value = currentUserData.username || '';
        document.getElementById('editBio').value = currentUserData.bio || '';
    }
};

window.closeEditProfile = () => {
    const modal = document.getElementById('editProfileModal');
    if (modal) modal.classList.add('hidden');
};

window.saveProfileChanges = async () => {
    showToast("Saving profile changes...", "info");
   
    // TODO: Add real save logic here later (Firestore update)
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
        currentProfileImageFile = file;
        showToast("Image preview ready", "success");
    };
    reader.readAsDataURL(file);
};

// ====================== BOOTSTRAP ======================
document.addEventListener('DOMContentLoaded', bootstrap);
