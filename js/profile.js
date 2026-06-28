// js/profile.js - Fixed & Clean
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './firebase-init.js';
import { updateUserProfile } from './db.js';
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
            // renderMyPosts(userId); // Uncomment when function exists
        }
    });
}

function renderProfileUI() {
    if (!currentUserData) return;

    const tierInfo = getTierInfo(currentUserData);
    
    // Avatar, username, email (keep your existing code)
    if (elements.avatar) { ... } // your code
    if (elements.username) elements.username.textContent = `@${currentUserData.username || 'citizen'}`;
    if (elements.email) elements.email.textContent = currentUserData.email || '';

    // Updated Tier Badge
    if (elements.profileTierContainer) {
        elements.profileTierContainer.innerHTML = `
            <div class="inline-flex items-center gap-3 px-6 py-4 bg-gradient-to-r from-${tierInfo.color}-500 to-${tierInfo.color}-600 text-black font-bold rounded-3xl shadow-lg">
                <span class="text-4xl">${tierInfo.emoji}</span>
                <div class="text-left">
                    <div class="text-xl">${tierInfo.name}</div>
                    <div class="text-xs opacity-90">${tierInfo.desc}</div>
                </div>
            </div>`;
    }

    // Trust Score
    const trustScore = currentUserData.trustCircle || currentUserData.reputationScore || 50;
    if (elements.trustScore) elements.trustScore.textContent = trustScore;
}

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
//phone number verification lawmann
window.sendOTP = async () => {
    const phone = document.getElementById('phoneInput').value.trim();
    const success = await sendPhoneVerification(phone, currentUserId);
    if (success) {
        document.getElementById('otpInput').classList.remove('hidden');
        document.getElementById('verifyBtn').classList.remove('hidden');
    }
};

window.verifyOTP = async () => {
    const code = document.getElementById('otpInput').value.trim();
    await verifyPhoneCode(code);
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
    };
    input.click();
};

// Show / Hide Profile
window.showProfileSection = () => {
    if (elements.profileSection) elements.profileSection.classList.remove('hidden');
    if (elements.homeSection) elements.homeSection.classList.add('hidden');
};

window.hideProfileSection = () => {
    if (elements.profileSection) elements.profileSection.classList.add('hidden');
    if (elements.homeSection) elements.homeSection.classList.remove('hidden');
};
