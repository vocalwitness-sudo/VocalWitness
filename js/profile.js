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

// Modal Controls
window.showProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
        if (currentUserData) renderProfileUI(currentUserData);
    }
};

window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');

window.editProfile = () => {
    // Basic for now
    showToast("Edit Profile - Coming in next update", "info");
};

window.logout = async () => {
    if (confirm("Sign out?")) {
        window.location.reload();
    }
};

window.addEventListener('beforeunload', () => {
    if (userUnsubscribe) userUnsubscribe();
});
