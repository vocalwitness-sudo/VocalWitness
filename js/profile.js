// js/profile.js - Stable Version
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { refreshTierAndUI } from './tier.js';

let currentUserData = null;
let userUnsubscribe = null;
let currentProfileImageFile = null;

export function initProfile() {
    if (userUnsubscribe) userUnsubscribe();
    onAuthStateChanged(auth, (user) => {
        if (user) listenToUserProfile(user.uid);
        else currentUserData = null;
    });
}

function listenToUserProfile(userId) {
    const userRef = doc(db, "users", userId);
    userUnsubscribe = onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            currentUserData = snapshot.data();
            renderProfileUI(currentUserData);
            refreshTierAndUI?.();
        }
    }, (error) => {
        console.error("Profile error:", error);
        showToast("Error loading profile", "error");
    });
}

function renderProfileUI(userData) {
    if (!userData) return;
    const content = document.getElementById('profileContent');
    if (!content) return;

    const tier = userData.tier || 'Base';
    const isZkVerified = userData.isZkVerified || false;

    content.innerHTML = `
        <div class="text-center">
            <div class="w-28 h-28 mx-auto rounded-3xl overflow-hidden border-4 border-zinc-700 mb-4">
                ${userData.photoURL ? `<img src="${userData.photoURL}" class="w-full h-full object-cover">` : '👤'}
            </div>
            <h3 class="text-2xl font-bold">${userData.displayName || "Anonymous Witness"}</h3>
            <p class="text-emerald-400">@${userData.username || 'anonymous'}</p>
            
            <div class="flex justify-center gap-3 mt-4">
                <div class="px-4 py-1 bg-emerald-900/60 text-emerald-400 rounded-2xl text-sm">⭐ ${tier} Tier</div>
                ${isZkVerified ? `<div class="px-4 py-1 bg-amber-900/60 text-amber-400 rounded-2xl text-sm">🔐 ZK Verified</div>` : ''}
            </div>
        </div>

        <button onclick="downloadMyDataPDF()" class="mt-10 w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 rounded-3xl font-medium">
            📄 Download My Full Data as PDF
        </button>
    `;
}

function escapeHtml(text) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
    return text.replace(/[&<>"']/g, m => map[m]);
}

// PDF Export
window.downloadMyDataPDF = async () => {
    if (!currentUserData) return showToast("Profile not loaded", "error");

    showToast("Generating PDF...", "info");

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        doc.setFontSize(20);
        doc.text("VocalWitness Personal Data", 20, 20);

        doc.setFontSize(12);
        doc.text(`Date: ${new Date().toLocaleString()}`, 20, 35);

        // Add more content as needed...

        doc.save(`vocalwitness-data-${Date.now()}.pdf`);
        showToast("✅ PDF Downloaded!", "success");
    } catch (e) {
        console.error(e);
        showToast("PDF generation failed", "error");
    }
};

// ====================== MODAL CONTROLS ======================
<!-- ==================== PROFILE MODAL ==================== -->
<div id="profileModal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4">
    <div class="glass rounded-3xl max-w-md w-full max-h-[90vh] overflow-auto p-6">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold text-emerald-400">My Profile</h2>
            <button onclick="closeProfile()" class="text-zinc-400 hover:text-white text-3xl leading-none">×</button>
        </div>
        <div id="profileContent" class="min-h-[200px]"></div>
        <div class="flex gap-3 mt-8">
            <button onclick="editProfile()" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl">✏️ Edit Profile</button>
            <button onclick="logout()" class="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl">Logout</button>
        </div>
    </div>
</div>

<!-- ==================== EDIT PROFILE MODAL ==================== -->
<div id="editProfileModal" class="hidden fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4">
    <div class="glass rounded-3xl max-w-md w-full p-6">
        <div class="flex justify-between items-center mb-6">
            <h2 class="text-2xl font-bold">Edit Profile</h2>
            <button onclick="closeEditProfile()" class="text-zinc-400 hover:text-white text-3xl leading-none">×</button>
        </div>
        <div class="space-y-6">
            <div class="flex flex-col items-center">
                <div id="profileImagePreview" class="w-24 h-24 rounded-3xl bg-zinc-700 flex items-center justify-center text-5xl mb-3 cursor-pointer border-2 border-dashed border-zinc-600 hover:border-emerald-500 transition-colors" onclick="document.getElementById('profileImageInput').click()">👤</div>
                <input type="file" id="profileImageInput" accept="image/*" class="hidden" onchange="handleProfileImageUpload(event)">
                <p class="text-xs text-zinc-500">Click to upload profile picture</p>
            </div>

            <div>
                <label class="block text-sm text-zinc-400 mb-1">Display Name</label>
                <input id="editDisplayName" type="text" class="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500">
            </div>
            <div>
                <label class="block text-sm text-zinc-400 mb-1">Username</label>
                <input id="editUsername" type="text" class="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500">
            </div>
            <div>
                <label class="block text-sm text-zinc-400 mb-1">Bio</label>
                <textarea id="editBio" rows="3" class="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-4 py-3 focus:outline-none focus:border-emerald-500 resize-none"></textarea>
            </div>

            <div class="flex items-center justify-between bg-zinc-900 p-4 rounded-2xl">
                <div>
                    <p class="font-medium">Make Profile Public</p>
                    <p class="text-xs text-zinc-500">Allow others to see your profile</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer">
                    <input type="checkbox" id="privacyToggle" class="sr-only peer">
                    <div class="w-11 h-6 bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                </label>
            </div>
        </div>

        <div class="flex gap-3 mt-8">
            <button onclick="closeEditProfile()" class="flex-1 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-2xl">Cancel</button>
            <button onclick="saveProfileChanges()" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl">Save Changes</button>
        </div>
    </div>
</div>

<script type="module" src="js/main.js"></script>
