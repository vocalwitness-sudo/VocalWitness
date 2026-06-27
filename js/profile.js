// js/profile.js - Upgraded (Preserves your original structure + Better UX)
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './firebase-init.js';
import { updateUserProfile } from './db.js';           // Keep your db.js functions
import { getTier, calculateTrustScore, showToast } from './utils.js';

const db = getFirestore();

let currentUserId = null;
let currentUserData = null;
let elements = {};

// Cache DOM elements
function cacheDOM() {
    elements = {
        avatar: document.getElementById('profile-avatar'),
        username: document.getElementById('profile-username'),
        email: document.getElementById('profile-email'),
        roleBadge: document.getElementById('profile-role-badge'),
        trustScore: document.getElementById('trust-score'),
        editDisplayName: document.getElementById('edit-displayName'),
        editBio: document.getElementById('edit-bio'),
        nameCooldown: document.getElementById('name-cooldown'),
        myPostsList: document.getElementById('my-posts-list'),
        postCount: document.getElementById('post-count'),
        reputationScore: document.getElementById('reputation-score'),
        profileTierContainer: document.getElementById('profile-tier-container'),
        profileSection: document.getElementById('profileSection'),
        homeSection: document.getElementById('homeSection')
    };
}

// Auth Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        cacheDOM();
        listenToUserProfile(user.uid);
    }
});

function listenToUserProfile(userId) {
    const userRef = doc(db, "users", userId);
    onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            currentUserData = snapshot.data();
            renderProfileUI();
            renderMyPosts(userId);   // Keep your existing function
        }
    });
}

function renderProfileUI() {
    if (!currentUserData) return;

    const trustScore = currentUserData.trustCircle || currentUserData.reputationScore || 50;
    const tier = getTier(trustScore);

    // Avatar
    if (elements.avatar) {
        elements.avatar.innerHTML = currentUserData.photoURL 
            ? `<img src="${currentUserData.photoURL}" class="w-full h-full object-cover rounded-3xl">` 
            : `<span class="text-6xl">👤</span>`;
        elements.avatar.onclick = window.uploadAvatar;
    }

    // Basic Info
    if (elements.username) elements.username.textContent = `@${currentUserData.username || 'citizen'}`;
    if (elements.email) elements.email.textContent = currentUserData.email || '';
    if (elements.roleBadge) elements.roleBadge.textContent = (currentUserData.role || 'citizen').toUpperCase();
    if (elements.trustScore) elements.trustScore.textContent = trustScore;

    // Stats
    if (elements.postCount) elements.postCount.textContent = currentUserData.testimoniesCount || 0;
    if (elements.reputationScore) elements.reputationScore.textContent = calculateTrustScore(currentUserData);

    // Tier Badge
    if (elements.profileTierContainer) {
        elements.profileTierContainer.innerHTML = `
            <div class="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-bold rounded-3xl text-lg shadow-lg">
                <span class="text-3xl">${tier.badge || '🌟'}</span>
                <div>
                    <div>${tier.name} Tier</div>
                    <div class="text-xs opacity-75">Trust Score: ${trustScore}/100</div>
                </div>
            </div>`;
    }

    // Edit fields
    if (elements.editDisplayName) elements.editDisplayName.value = currentUserData.displayName || '';
    if (elements.editBio) elements.editBio.value = currentUserData.bio || '';

    showNameCooldown(currentUserData.lastNameChange);
    
function showNameCooldown(lastChange) {
    if (!elements.nameCooldown || !lastChange) return;
    const daysLeft = Math.ceil((lastChange + 60*24*60*60*1000 - Date.now()) / 86400000);
    elements.nameCooldown.textContent = daysLeft > 0 ? `(Next change in ${daysLeft} days)` : 'You can change now';
}

// ==================== SAVE PROFILE ====================
window.saveProfile = async () => {
    if (!currentUserId) return;
    const updates = {
        displayName: elements.editDisplayName?.value.trim(),
        bio: elements.editBio?.value.trim()
    };
    Object.keys(updates).forEach(key => { if (!updates[key]) delete updates[key]; });

    try {
        await updateUserProfile(currentUserId, updates);
        showToast("✅ Profile updated successfully!", "success");
    } catch (error) {
        showToast("❌ Failed to update profile: " + error.message, "error");
    }
};

// ==================== AVATAR UPLOAD ====================
window.uploadAvatar = async () => {
    if (!currentUserId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showToast("Image must be under 5MB", "error");
            return;
        }
        showToast("Avatar upload connected to storage.js (coming soon)", "info");
        // TODO: Connect to uploadForensicMedia later
    };
    input.click();
};

// Show / Hide Profile
window.showProfileSection = () => {
    if (elements.profileSection) elements.profileSection.classList.add('active');
    if (elements.homeSection) elements.homeSection.classList.remove('active');
};

window.hideProfileSection = () => {
    if (elements.profileSection) elements.profileSection.classList.remove('active');
    if (elements.homeSection) elements.homeSection.classList.add('active');
};

// Keep your other handlers (renderMyPosts, editPostHandler, etc.)
// Paste them here if they exist in your backup
