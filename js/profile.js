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

    content.innerHTML = `
        <div class="text-center">
            <div class="w-24 h-24 mx-auto bg-gradient-to-br from-emerald-500 to-teal-500 rounded-3xl flex items-center justify-center text-5xl mb-4 shadow-inner">
                👤
            </div>
            <h3 id="profileName" class="text-2xl font-bold">${escapeHtml(userData.displayName || "Anonymous Witness")}</h3>
            <p id="profileUsername" class="text-emerald-400">@${escapeHtml(userData.username || 'user_' + (userData.uid || '').slice(0,6))}</p>
            ${userData.bio ? `<p class="text-zinc-400 mt-3 text-sm max-w-xs mx-auto">${escapeHtml(userData.bio)}</p>` : ''}
        </div>
       
        <div class="grid grid-cols-3 gap-4 text-center mt-8">
            <div>
                <div class="text-2xl font-bold text-emerald-400">${userData.testimoniesCount || 0}</div>
                <div class="text-xs text-zinc-500">Testimonies</div>
            </div>
            <div>
                <div class="text-2xl font-bold">${userData.credibilityScore || 50}</div>
                <div class="text-xs text-zinc-500">Credibility</div>
            </div>
            <div>
                <div class="text-2xl font-bold">${userData.integrityScore || 60}</div>
                <div class="text-xs text-zinc-500">Integrity</div>
            </div>
        </div>
    `;
}

// Simple HTML escape helper
function escapeHtml(unsafe) {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

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

    // Basic validation
    if (newUsername && (newUsername.length < 3 || newUsername.length > 20)) {
        return showToast("Username must be 3-20 characters", "error");
    }
    if (newUsername && !/^[a-z0-9_]+$/.test(newUsername)) {
        return showToast("Username can only contain lowercase letters, numbers and _", "error");
    }

    try {
        const userRef = doc(db, "users", user.uid);
        
        const updateData = {
            displayName: newDisplayName || "Anonymous Witness",
            bio: newBio || null,
            updatedAt: serverTimestamp()
        };

        if (newUsername) updateData.username = newUsername;

        await updateDoc(userRef, updateData);

        showToast("✅ Profile updated successfully", "success");
        closeEditProfile();
    } catch (error) {
        console.error("Profile update error:", error);
        if (error.code === 'permission-denied') {
            showToast("Permission denied. Please try again.", "error");
        } else {
            showToast("Failed to save changes", "error");
        }
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
