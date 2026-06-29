// js/profile.js - SIMPLIFIED & FIXED VERSION
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './firebase-config.js';   // Changed to firebase-config
import { showToast } from './utils.js';

let currentUserId = null;
let currentUserData = null;

function cacheDOM() {
    return {
        profileModal: document.getElementById('profileModal'),
        profileName: document.getElementById('profileName'),
        profileUsername: document.getElementById('profileUsername'),
        postCount: document.getElementById('post-count'),
        reputationScore: document.getElementById('reputation-score'),
        trustScore: document.getElementById('trust-score')
    };
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        listenToUserProfile(user.uid);
    }
});

function listenToUserProfile(userId) {
    const db = window.db || window.firebase?.firestore?.(); // fallback
    if (!db) {
        console.warn("Firestore not available for profile");
        return;
    }
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
    const els = cacheDOM();

    if (els.profileName) els.profileName.textContent = currentUserData.displayName || "Anonymous Witness";
    if (els.profileUsername) els.profileUsername.textContent = `@${currentUserData.username || 'user'}`;
    
    if (els.postCount) els.postCount.textContent = currentUserData.testimoniesCount || 0;
    if (els.reputationScore) els.reputationScore.textContent = currentUserData.reputation || 50;
    if (els.trustScore) els.trustScore.textContent = currentUserData.trustScore || 85;
}

window.showProfileSection = () => {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
        if (currentUserData) renderProfileUI();
        else if (currentUserId) listenToUserProfile(currentUserId);
    } else {
        showToast("Profile modal not found", "error");
    }
};

window.closeProfile = () => {
    document.getElementById('profileModal')?.classList.add('hidden');
};

window.logout = () => {
    showToast("Signed out successfully", "success");
    window.location.reload();
};
