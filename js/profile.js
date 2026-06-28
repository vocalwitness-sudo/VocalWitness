// js/profile.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './firebase-init.js';
import { updateUserProfile } from './db.js';
import { getTierInfo } from './tier.js';           // ← Changed
import { sendPhoneVerification, verifyPhoneCode } from './phoneVerification.js';  // ← Added
import { showToast } from './utils.js';

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
        }
    });
}

function renderProfileUI() {
    if (!currentUserData) return;

    const tierInfo = getTierInfo(currentUserData);

    // Avatar
    if (elements.avatar) {
        elements.avatar.innerHTML = currentUserData.photoURL 
            ? `<img src="${currentUserData.photoURL}" class="w-full h-full object-cover rounded-3xl">` 
            : `<span class="text-6xl">👤</span>`;
    }

    if (elements.username) elements.username.textContent = `@${currentUserData.username || 'citizen'}`;
    if (elements.email) elements.email.textContent = currentUserData.email || '';

    // Tier Badge
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

    const trustScore = currentUserData.trustCircle || currentUserData.reputationScore || 50;
    if (elements.trustScore) elements.trustScore.textContent = trustScore;
}

// Phone Verification Handlers
window.sendOTP = async () => {
    const phone = document.getElementById('phoneInput')?.value.trim();
    if (!phone) return showToast("Enter phone number", "error");
    await sendPhoneVerification(phone, currentUserId);
};

window.verifyOTP = async () => {
    const code = document.getElementById('otpInput')?.value.trim();
    if (!code) return;
    await verifyPhoneCode(code);
};

// Save Profile & Avatar (keep your existing)
window.saveProfile = async () => { ... };   // your code
window.uploadAvatar = async () => { ... };  // your code

window.showProfileSection = () => { ... };
window.hideProfileSection = () => { ... };
