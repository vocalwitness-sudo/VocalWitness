// js/profile.js - Safe & Robust Version
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
    const userRef = doc(db, "users", userId);
    onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            currentUserData = snapshot.data();
            renderProfileUI(currentUserData);
        } else {
            console.warn("User document not found");
        }
    });
}

function renderProfileUI(userData) {
    if (!userData) return;

    // Use optional chaining + fallback to prevent crashes
    const profileName = document.getElementById('profileName');
    const profileUsername = document.getElementById('profileUsername');
    const postCount = document.getElementById('post-count');
    const reputationScore = document.getElementById('reputation-score');
    const trustScore = document.getElementById('trust-score');

    if (profileName) profileName.textContent = userData.displayName || "Anonymous Witness";
    if (profileUsername) profileUsername.textContent = `@${userData.username || 'user_' + (userData.uid || '').slice(0,6)}`;
    
    if (postCount) postCount.textContent = userData.testimoniesCount || 0;
    if (reputationScore) reputationScore.textContent = userData.reputationScore || 50;
    if (trustScore) trustScore.textContent = userData.trustScore || 60;

    console.log("✅ Profile UI updated:", userData);
}

// Global functions for modal
window.showProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('hidden');
    // Re-render when opening
    if (currentUserData) renderProfileUI(currentUserData);
};

window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
};

window.editProfile = () => {
    showToast("✏️ Edit profile coming soon", "info");
};

window.downloadPassport = () => {
    showToast("📄 PDF download coming soon", "info");
};

window.showSettings = () => {
    showToast("⚙️ Settings & Privacy coming soon", "info");
};

window.logout = async () => {
    if (confirm("Sign out of VocalWitness?")) {
        try {
            // You can add real auth signOut here later
            showToast("✅ Signed out successfully", "success");
            setTimeout(() => window.location.reload(), 800);
        } catch (e) {
            console.error(e);
            window.location.reload();
        }
    }
};
