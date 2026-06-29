// js/profile.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './firebase-init.js';
import { updateUserProfile } from './db.js';
import { getTierInfo } from './tier.js';
import { sendPhoneVerification, verifyPhoneCode } from './phoneVerification.js';
import { showToast } from './utils.js';

const db = getFirestore();
let currentUserId = null;
let currentUserData = null;

// Cache DOM elements
function cacheDOM() {
    return {
        profileModal: document.getElementById('profileModal'),
        profileName: document.getElementById('profileName'),
        profileUsername: document.getElementById('profileUsername'),
        postCount: document.getElementById('post-count'),
        reputationScore: document.getElementById('reputation-score'),
        trustScore: document.getElementById('trust-score'),
        roleBadge: document.getElementById('profile-role-badge'),
        witnessCycleStatus: document.getElementById('witness-cycle-status')
    };
}

// Auth Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
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

    const els = cacheDOM();
    const tierInfo = getTierInfo(currentUserData);

    // Basic Profile Info
    if (els.profileName) els.profileName.textContent = currentUserData.displayName || "Anonymous Witness";
    if (els.profileUsername) els.profileUsername.textContent = `@${currentUserData.username || 'user'}`;
    if (els.roleBadge) els.roleBadge.textContent = tierInfo.name || "Citizen";

    // Stats
    if (els.postCount) els.postCount.textContent = currentUserData.postCount || 0;
    if (els.reputationScore) els.reputationScore.textContent = currentUserData.reputation || 0;
    if (els.trustScore) els.trustScore.textContent = currentUserData.trustScore || 85;

    // Witness Cycle Status
    const cycleContainer = els.witnessCycleStatus;
    if (cycleContainer) {
        const isActive = currentUserData.activeWitnessCycle === true;
        cycleContainer.innerHTML = `
            <div class="flex items-center justify-between bg-zinc-900/70 rounded-2xl p-5">
                <div>
                    <div class="text-sm text-zinc-400">Witness Cycle</div>
                    <div class="font-semibold ${isActive ? 'text-emerald-400' : 'text-zinc-400'}">
                        ${isActive ? '🟢 Active - Attesting' : '⚪ Inactive'}
                    </div>
                </div>
                ${!isActive && tierInfo.name === "True Witness" ? `
                <button onclick="startWitnessCycleFromProfile()" 
                        class="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-sm font-medium">
                    Start Cycle
                </button>` : ''}
            </div>`;
    }
}

// ==================== PROFILE MODAL CONTROLS ====================
window.showProfileSection = () => {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
        if (currentUserData) {
            renderProfileUI();
        } else if (currentUserId) {
            listenToUserProfile(currentUserId);
        }
    } else {
        console.error("❌ Profile modal not found");
        showToast("Profile modal not available", "error");
    }
};

window.closeProfile = () => {
    document.getElementById('profileModal')?.classList.add('hidden');
};

// Phone Verification
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

// Placeholders for other functions
window.saveProfile = async () => {
    showToast("Profile save coming soon...", "info");
};

window.logout = () => {
    showToast("Signed out successfully", "success");
    // Add actual logout logic here
    window.location.reload();
};

window.startWitnessCycleFromProfile = async () => {
    if (!currentUserData) return;
    try {
        const { startWitnessCycle } = await import('./witnessCycle.js');
        await startWitnessCycle(currentUserData);
    } catch (e) {
        console.error(e);
        showToast("Witness cycle feature not ready yet", "error");
    }
};
