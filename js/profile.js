// js/profile.js - Stable Version
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { refreshTierAndUI } from './tier.js';

let currentUserData = null;
let userUnsubscribe = null;
let currentProfileImageFile = null;
window.currentUserData = null;

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
            window.currentUserData = currentUserData;   // ← This makes it global
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
        
        <!-- Buttons Section -->
        <div class="flex gap-3 mt-8">
            <button onclick="openEditProfile()" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-black font-medium rounded-2xl">✏️ Edit Profile</button>
            <button onclick="downloadMyDataPDF()" class="flex-1 py-3 bg-zinc-700 hover:bg-zinc-600 rounded-2xl">📄 Download PDF</button>
        </div>
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

// You can add more functions here if needed (handleProfileImageUpload, saveProfileChanges, etc.)

// ====================== EDIT PROFILE FUNCTIONS ======================

window.openEditProfile = () => {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return showToast("Edit modal not found", "error");

    // Populate form with current data
    if (currentUserData) {
        document.getElementById('editDisplayName').value = currentUserData.displayName || '';
        document.getElementById('editUsername').value = currentUserData.username || '';
        document.getElementById('editBio').value = currentUserData.bio || '';
        
        // Show current photo if exists
        const preview = document.getElementById('profileImagePreview');
        if (currentUserData.photoURL && preview) {
            preview.innerHTML = `<img src="${currentUserData.photoURL}" class="w-full h-full object-cover rounded-3xl">`;
        }
    }

    modal.classList.remove('hidden');
};

window.closeEditProfile = () => {
    document.getElementById('editProfileModal').classList.add('hidden');
};

window.handleProfileImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (file.size > 5 * 1024 * 1024) {
        return showToast("Image must be smaller than 5MB", "error");
    }
    
    currentProfileImageFile = file;
    showToast("Image selected. It will upload when you save.", "info");
    
    const preview = document.getElementById('profileImagePreview');
    if (preview) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            preview.innerHTML = `<img src="${ev.target.result}" class="w-full h-full object-cover rounded-3xl">`;
        };
        reader.readAsDataURL(file);
    }
};

window.saveProfileChanges = async () => {
    if (!auth.currentUser) {
        return showToast("You must be logged in", "error");
    }

    const displayName = document.getElementById('editDisplayName').value.trim();
    const username = document.getElementById('editUsername').value.trim();
    const bio = document.getElementById('editBio').value.trim();

    if (!displayName) {
        return showToast("Display name is required", "error");
    }

    try {
        showToast("Saving changes...", "info");
        
        const userRef = doc(db, "users", auth.currentUser.uid);
        
        const updateData = {
            displayName,
            username: username || null,
            bio: bio || null,
            updatedAt: serverTimestamp()
        };

        await updateDoc(userRef, updateData);
        
        showToast("✅ Profile updated successfully!", "success");
        closeEditProfile();
        
        if (typeof refreshTierAndUI === 'function') refreshTierAndUI();
        
    } catch (error) {
        console.error("Save profile error:", error);
        showToast("Failed to save profile. Try again.", "error");
    }
};
