// js/profile.js - Integrated with AppState + Circles
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { AppState, updateAppState } from './app-state.js';
import { refreshTierAndUI } from './tier.js';

let currentUserData = null;

export function initProfile() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            listenToUserProfile(user.uid);
            updateAppState({ isAuthenticated: true, currentUser: user });
        } else {
            updateAppState({ isAuthenticated: false, currentUser: null });
        }
    });
}

function listenToUserProfile(userId) {
    const userRef = doc(db, "users", userId);
    onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            currentUserData = snapshot.data();
            renderProfileUI(currentUserData);
            refreshTierAndUI();
        }
    });
}

function renderProfileUI(userData) {
    if (!userData) return;

    // Update elements if they exist in modal or profile page
    const fields = {
        profileName: userData.displayName || "Anonymous Witness",
        profileUsername: `@${userData.username || 'user_' + (userData.uid || '').slice(0,6)}`,
        postCount: userData.testimoniesCount || 0,
        reputationScore: userData.credibilityScore || 50,
        trustScore: userData.integrityScore || 60
    };

    Object.keys(fields).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = fields[id];
    });
}

// Modal Controls
window.showProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
        if (currentUserData) renderProfileUI(currentUserData);
    } else {
        showToast("Opening My Identity...", "info");
        // Future: navigate to dedicated profile page
    }
};

window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
};

window.editProfile = () => showToast("✏️ Edit Identity coming soon", "info");
window.downloadPassport = () => showToast("📄 Digital Passport (PDF) coming soon", "info");
window.showSettings = () => showToast("⚙️ Settings & Privacy", "info");

window.logout = async () => {
    if (confirm("Sign out of VocalWitness?")) {
        try {
            const { logout } = await import('./auth.js');
            await logout();
        } catch (e) {
            console.error(e);
            window.location.reload();
        }
    }
};
