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

    // ... your existing avatar, username, email, tier badge code ...

    // === NEW: Witness Cycle Status ===
    const cycleContainer = document.getElementById('witness-cycle-status');
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
window.startWitnessCycleFromProfile = async () => {
    if (!currentUserData) return;
    const { startWitnessCycle } = await import('./witnessCycle.js');
    await startWitnessCycle(currentUserData);
};
