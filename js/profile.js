// js/profile.js - User Profile Module
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { refreshTierAndUI } from './tier.js';

let currentUserData = null;
let userUnsubscribe = null;

// ====================== INIT ======================
export function initProfile() {
    if (userUnsubscribe) userUnsubscribe(); // Cleanup previous listener

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

    // ==================== REAL PDF EXPORT ====================
window.downloadMyDataPDF = async () => {
    const user = auth.currentUser;
    if (!user || !currentUserData) {
        return showToast("Please wait for profile to load", "error");
    }

    showToast("📄 Generating your Personal Data Export...", "info");

    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        let y = 20;

        // Header
        doc.setFontSize(20);
        doc.text("VocalWitness - Personal Data Export", 20, y);
        y += 15;

        doc.setFontSize(12);
        doc.text(`Exported on: ${new Date().toLocaleString()}`, 20, y);
        y += 10;

        // User Information
        doc.setFontSize(16);
        doc.text("Profile Information", 20, y);
        y += 10;

        doc.setFontSize(11);
        doc.text(`Display Name: ${currentUserData.displayName || "Anonymous Witness"}`, 20, y);
        y += 8;
        doc.text(`Username: @${currentUserData.username || 'N/A'}`, 20, y);
        y += 8;
        doc.text(`Tier: ${currentUserData.tier || 'Base'}`, 20, y);
        y += 8;
        doc.text(`ZK Verified: ${currentUserData.isZkVerified ? 'Yes' : 'No'}`, 20, y);
        y += 8;
        doc.text(`Credibility Score: ${currentUserData.credibilityScore || 50}`, 20, y);
        y += 8;
        if (currentUserData.bio) {
            doc.text(`Bio: ${currentUserData.bio}`, 20, y);
            y += 8;
        }
        y += 10;

        // Testimonies Summary
        doc.setFontSize(16);
        doc.text("Activity Summary", 20, y);
        y += 10;

        doc.setFontSize(11);
        doc.text(`Total Testimonies: ${currentUserData.testimoniesCount || 0}`, 20, y);
        y += 8;
        doc.text(`Integrity Score: ${currentUserData.integrityScore || 60}`, 20, y);
        y += 15;

        // Footer / Privacy Note
        doc.setFontSize(10);
        doc.text("This document contains your personal data from VocalWitness.", 20, y);
        y += 8;
        doc.text("Generated for transparency and data portability.", 20, y);

        // Save the PDF
        const fileName = `vocalwitness-data-${user.uid.slice(0,8)}.pdf`;
        doc.save(fileName);

        showToast("✅ Your data has been exported successfully!", "success");

    } catch (error) {
        console.error("PDF generation error:", error);
        showToast("Failed to generate PDF. Please try again.", "error");
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
    if (!modal || !currentUserData) {
        showToast("Profile data not loaded yet", "error");
        return;
    }

    document.getElementById('editDisplayName').value = currentUserData.displayName || "";
    document.getElementById('editUsername').value = currentUserData.username || "";
    document.getElementById('editBio').value = currentUserData.bio || "";

    modal.classList.remove('hidden');
};

window.closeEditProfile = () => {
    const modal = document.getElementById('editProfileModal');
    if (modal) modal.classList.add('hidden');
};

window.saveProfileChanges = async () => {
    const user = auth.currentUser;
    if (!user) {
        showToast("You must be logged in", "error");
        return;
    }

    const newDisplayName = document.getElementById('editDisplayName').value.trim();
    let newUsername = document.getElementById('editUsername').value.trim().toLowerCase();
    const newBio = document.getElementById('editBio').value.trim();
    const isPublic = document.getElementById('privacyToggle').checked;

    // Validation...
    if (newUsername && (newUsername.length < 3 || newUsername.length > 20)) {
        return showToast("Username must be 3-20 characters", "error");
    }

    try {
        const userRef = doc(db, "users", user.uid);
        const updateData = {
            displayName: newDisplayName || "Anonymous Witness",
            bio: newBio || null,
            isPublic: isPublic,
            updatedAt: serverTimestamp()
        };

        if (newUsername) updateData.username = newUsername;

        // Upload image if selected
        if (currentProfileImageFile) {
            const { ref, uploadBytes, getDownloadURL } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-storage.js");
            const { storage } = await import('./firebase-config.js');
            
            const imageRef = ref(storage, `profile-images/${user.uid}`);
            await uploadBytes(imageRef, currentProfileImageFile);
            const photoURL = await getDownloadURL(imageRef);
            updateData.photoURL = photoURL;
        }

        await updateDoc(userRef, updateData);
        
        showToast("✅ Profile updated successfully", "success");
        closeEditProfile();
        currentProfileImageFile = null; // Reset
    } catch (error) {
        console.error("Profile update error:", error);
        showToast("Failed to save changes", "error");
    }
};

// Profile Image Upload
let currentProfileImageFile = null;

window.handleProfileImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        return showToast("Please upload an image file", "error");
    }

    currentProfileImageFile = file;

    // Preview
    const reader = new FileReader();
    reader.onload = (ev) => {
        const preview = document.getElementById('profileImagePreview');
        if (preview) preview.innerHTML = `<img src="${ev.target.result}" class="w-full h-full object-cover rounded-3xl">`;
    };
    reader.readAsDataURL(file);

    showToast("Image selected. It will upload when you save.", "success");
};
window.logout = async () => {
    if (!confirm("Sign out of VocalWitness?")) return;

    try {
        const { logout } = await import('./auth.js');
        await logout();
    } catch (e) {
        console.error("Logout error:", e);
        showToast("Signed out locally", "info");
        window.location.reload();
    }
};

// Cleanup on page unload (good practice)
window.addEventListener('beforeunload', () => {
    if (userUnsubscribe) userUnsubscribe();
});
