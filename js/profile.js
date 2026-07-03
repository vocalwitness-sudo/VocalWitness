// js/profile.js - FINAL VERSION
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';

let currentUserData = null;

onAuthStateChanged(auth, (user) => {
    if (user) {
        listenToUserProfile(user.uid);
    }
});

function listenToUserProfile(userId) {
    if (!db) {
        console.warn("Firestore db not available");
        return;
    }

    const userRef = doc(db, "users", userId);
    onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            currentUserData = snapshot.data();
            renderProfileUI(currentUserData);
        }
    });
}

function renderProfileUI(userData) {
    if (!userData) return;

    // Basic Info
    document.getElementById('profileName').textContent = userData.displayName || "Anonymous Witness";
    document.getElementById('profileUsername').textContent = `@${userData.username || 'user_' + (userData.uid || '').slice(0,6)}`;

    // Stats
    document.getElementById('post-count').textContent = userData.testimoniesCount || 0;
    document.getElementById('reputation-score').textContent = userData.reputation || 50;
    document.getElementById('trust-score').textContent = userData.trustScore || 60;

    // Supporter Badge
    const badgeContainer = document.getElementById('supporterBadgeContainer');
    if (userData.isPlatformSupporter === true) {
        badgeContainer.classList.remove('hidden');
    } else {
        badgeContainer.classList.add('hidden');
    }

    console.log("Profile updated with Firestore data:", userData);
}

window.showProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeProfile = () => {
    document.getElementById('profileModal').classList.add('hidden');
};

window.logout = () => {
    showToast("Signed out", "success");
    window.location.reload();
};
