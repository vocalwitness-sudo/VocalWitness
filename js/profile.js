// js/profile.js - User Profile Module
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { refreshTierAndUI } from './tier.js';

let currentUserData = null;
let userUnsubscribe = null;
let currentProfileImageFile = null;

// ====================== INIT ======================
export function initProfile() {
    if (userUnsubscribe) userUnsubscribe();
    onAuthStateChanged(auth, (user) => {
        if (user) {
            listenToUserProfile(user.uid);
        } else {
            currentUserData = null;
        }
    });
}

function listenToUserProfile(userId) {
    const userRef = doc(db, "users", userId);
    userUnsubscribe = onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            currentUserData = snapshot.data();
            renderProfileUI(currentUserData);
            refreshTierAndUI?.();
        } else {
            console.warn("User document not found");
        }
    }, (error) => {
        console.error("Profile snapshot error:", error);
        showToast("Error loading profile data", "error");
    });
}

// ====================== RENDER ======================
function renderProfileUI(userData) {
    if (!userData) return;
    const content = document.getElementById('profileContent');
    if (!content) return;

    const tier = userData.tier || 'Base';
    const isZkVerified = userData.isZkVerified || false;
    const credibility = userData.credibilityScore || 50;

    content.innerHTML = `
        <div class="text-center">
            <div id="profileImageLarge" class="w-28 h-28 mx-auto bg-gradient-to-br from-emerald-500 to-teal-500 rounded-3xl flex items-center justify-center text-6xl mb-4 shadow-inner border-4 border-zinc-800 overflow-hidden">
                ${userData.photoURL ? `<img src="${userData.photoURL}" class="w-full h-full object-cover">` : '👤'}
            </div>
            <h3 class="text-2xl font-bold">${escapeHtml(userData.displayName || "Anonymous Witness")}</h3>
            <p class="text-emerald-400">@${escapeHtml(userData.username || 'user_' + (userData.uid || '').slice(0,6))}</p>
            
            <div class="flex justify-center gap-3 mt-4">
                <div class="px-4 py-1.5 bg-emerald-900/50 text-emerald-400 text-sm font-medium rounded-2xl flex items-center gap-1.5">
                    ⭐ ${tier} Tier
                </div>
                ${isZkVerified ? `<div class="px-4 py-1.5 bg-amber-900/50 text-amber-400 text-sm font-medium rounded-2xl flex items-center gap-1.5">🔐 ZK Verified</div>` : ''}
            </div>
            ${userData.bio ? `<p class="text-zinc-400 mt-5 text-sm max-w-xs mx-auto">${escapeHtml(userData.bio)}</p>` : ''}
        </div>

        <div class="grid grid-cols-3 gap-4 text-center mt-8">
            <div><div class="text-2xl font-bold text-emerald-400">${userData.testimoniesCount || 0}</div><div class="text-xs text-zinc-500">Testimonies</div></div>
            <div><div class="text-2xl font-bold">${credibility}</div><div class="text-xs text-zinc-500">Credibility</div></div>
            <div><div class="text-2xl font-bold">${userData.integrityScore || 60}</div><div class="text-xs text-zinc-500">Integrity</div></div>
        </div>

        <button onclick="downloadMyDataPDF()" class="mt-8 w-full py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-2xl flex items-center justify-center gap-2 text-sm font-medium">
            📄 Download My Data as PDF
        </button>
    `;
}

function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// ====================== PDF EXPORT ======================
window.downloadMyDataPDF = async () => {
    const user = auth.currentUser;
    if (!user || !currentUserData) return showToast("Profile data not loaded yet", "error");

    showToast("📄 Generating full data report...", "info");

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let y = 20;

        doc.setFontSize(22);
        doc.text("VocalWitness - Personal Data Export", 20, y);
        y += 15;

        doc.setFontSize(11);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 20, y);
        y += 10;

        // Profile Info
        doc.setFontSize(16);
        doc.text("Profile Information", 20, y);
        y += 10;
        doc.setFontSize(11);

        const profileInfo = [
            ["Display Name", currentUserData.displayName || "Anonymous Witness"],
            ["Username", `@${currentUserData.username || 'N/A'}`],
            ["Tier", currentUserData.tier || "Base"],
            ["ZK Verified", currentUserData.isZkVerified ? "Yes" : "No"],
            ["Credibility", currentUserData.credibilityScore || 50],
            ["Bio", currentUserData.bio || "—"]
        ];

        profileInfo.forEach(([label, value]) => {
            doc.text(`${label}: ${value}`, 20, y);
            y += 8;
        });
        y += 15;

        // Testimonies
        doc.setFontSize(16);
        doc.text("Testimony History", 20, y);
        y += 12;

        const { collection, query, where, getDocs, orderBy } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        const q = query(collection(db, "testimonies"), where("authorId", "==", user.uid), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);

        const rows = [];
        snapshot.forEach(d => {
            const data = d.data();
            rows.push([
                new Date(data.createdAt?.toDate?.() || Date.now()).toLocaleDateString(),
                data.content ? data.content.substring(0, 70) + "..." : "—",
                data.moderationStatus || "approved"
            ]);
        });

        if (rows.length > 0) {
            doc.autoTable({
                startY: y,
                head: [['Date', 'Preview', 'Status']],
                body: rows,
                styles: { fontSize: 9 },
                headStyles: { fillColor: [16, 185, 129] }
            });
        } else {
            doc.text("No testimonies yet.", 20, y + 10);
        }

        doc.save(`vocalwitness-export-${new Date().toISOString().slice(0,10)}.pdf`);
        showToast("✅ Data exported successfully!", "success");
    } catch (error) {
        console.error(error);
        showToast("Failed to generate PDF", "error");
    }
};

// ====================== MODAL CONTROLS ======================
window.showProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
        if (currentUserData) renderProfileUI(currentUserData);
    } else {
        showToast("Profile modal not found", "error");
    }
};

window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
};

window.editProfile = () => {
    const modal = document.getElementById('editProfileModal');
    if (!modal || !currentUserData) return showToast("Profile data not loaded", "error");

    document.getElementById('editDisplayName').value = currentUserData.displayName || "";
    document.getElementById('editUsername').value = currentUserData.username || "";
    document.getElementById('editBio').value = currentUserData.bio || "";
    document.getElementById('privacyToggle').checked = currentUserData.isPublic || false;

    modal.classList.remove('hidden');
};

window.closeEditProfile = () => {
    const modal = document.getElementById('editProfileModal');
    if (modal) modal.classList.add('hidden');
};

window.saveProfileChanges = async () => { /* your existing save logic */ };

// Profile Image Upload
window.handleProfileImageUpload = async (e) => { /* your existing upload logic */ };

window.logout = async () => { /* your existing logout */ };

window.addEventListener('beforeunload', () => {
    if (userUnsubscribe) userUnsubscribe();
});
