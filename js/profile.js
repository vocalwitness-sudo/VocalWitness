// js/profile.js - Fixed & Simple Version
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';

let currentUserData = null;

onAuthStateChanged(auth, (user) => {
    if (user) listenToUserProfile(user.uid);
});

function listenToUserProfile(userId) {
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

    document.getElementById('profileName').textContent = userData.displayName || "Anonymous Witness";
    document.getElementById('profileUsername').textContent = `@${userData.username || 'user_' + (userData.uid || '').slice(0,6)}`;

    document.getElementById('post-count').textContent = userData.testimoniesCount || 0;
    document.getElementById('reputation-score').textContent = userData.reputationScore || 50;
    document.getElementById('trust-score').textContent = userData.trustScore || 60;

    console.log("Profile updated:", userData);
}

window.showProfile = () => {
    document.getElementById('profileModal').classList.remove('hidden');
};

window.closeProfile = () => {
    document.getElementById('profileModal').classList.add('hidden');
};

window.logout = () => {
    if (confirm("Sign out?")) {
        showToast("Signed out", "success");
        window.location.reload();
    }
};

// Global functions for buttons
window.editProfile = () => {
    showToast("Edit name coming soon", "info");
};

window.downloadPassport = () => {
    showToast("PDF download coming soon", "info");
};

window.showSettings = () => {
    showToast("Settings coming soon", "info");
};
