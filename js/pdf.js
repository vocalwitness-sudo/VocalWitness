// js/profile.js - Enhanced Version
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { generateAndDownloadPDF } from './pdf.js';

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
    document.getElementById('reputation-score').textContent = userData.reputationScore || 50;
    document.getElementById('trust-score').textContent = userData.trustScore || 60;

    // Tier
    document.getElementById('profile-tier').textContent = userData.tier ? userData.tier.toUpperCase() : "CITIZEN";

    // Verification Status
    const statusContainer = document.getElementById('verification-status');
    if (statusContainer) {
        statusContainer.innerHTML = `
            <div class="flex justify-between items-center">
                <span>Phone Verified</span>
                <span class="${userData.isPhoneVerified ? 'text-green-400' : 'text-red-400'}">${userData.isPhoneVerified ? 'Yes' : 'No'}</span>
            </div>
            <div class="flex justify-between items-center">
                <span>ZK Verified</span>
                <span class="${userData.zkVerified ? 'text-amber-400' : 'text-red-400'}">${userData.zkVerified ? 'Yes' : 'No'}</span>
            </div>
        `;
    }
}

window.showProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.remove('hidden');
};

window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
};

window.editProfile = () => {
    const newName = prompt("Enter new display name (can only change once every 6 months):", document.getElementById('profileName').textContent);
    if (newName && newName.length > 2) {
        showToast("Name change request sent (simulated)", "success");
    }
};

window.downloadPassport = () => {
    if (currentUserData) {
        generateAndDownloadPDF({ uid: auth.currentUser.uid, displayName: currentUserData.displayName }, db);
    } else {
        showToast("Please wait for profile to load", "error");
    }
};

window.showSettings = () => {
    showToast("Settings panel coming soon", "info");
};

window.logout = () => {
    if (confirm("Sign out?")) {
        showToast("Signed out successfully", "success");
        window.location.reload();
    }
};
