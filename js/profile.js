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
            <div id="profileImageLarge" 
                 class="w-28 h-28 mx-auto bg-gradient-to-br from-emerald-500 to-teal-500 rounded-3xl flex items-center justify-center text-6xl mb-4 shadow-inner border-4 border-zinc-800 overflow-hidden">
                ${userData.photoURL 
                    ? `<img src="${userData.photoURL}" class="w-full h-full object-cover">` 
                    : '👤'}
            </div>
            
            <h3 id="profileName" class="text-2xl font-bold">${escapeHtml(userData.displayName || "Anonymous Witness")}</h3>
            <p id="profileUsername" class="text-emerald-400">@${escapeHtml(userData.username || 'user_' + (userData.uid || '').slice(0,6))}</p>
            
            <!-- Tier & ZK Status -->
            <div class="flex justify-center gap-3 mt-4">
                <div class="px-4 py-1.5 bg-emerald-900/50 text-emerald-400 text-sm font-medium rounded-2xl flex items-center gap-1.5">
                    <span>⭐</span> 
                    <span>${tier} Tier</span>
                </div>
                
                ${isZkVerified ? `
                <div class="px-4 py-1.5 bg-amber-900/50 text-amber-400 text-sm font-medium rounded-2xl flex items-center gap-1.5">
                    <span>🔐</span> 
                    <span>ZK Verified</span>
                </div>` : ''}
            </div>

            ${userData.bio ? `<p class="text-zinc-400 mt-5 text-sm max-w-xs mx-auto">${escapeHtml(userData.bio)}</p>` : ''}
        </div>
      
        <!-- Stats -->
        <div class="grid grid-cols-3 gap-4 text-center mt-8">
            <div>
                <div class="text-2xl font-bold text-emerald-400">${userData.testimoniesCount || 0}</div>
                <div class="text-xs text-zinc-500">Testimonies</div>
            </div>
            <div>
                <div class="text-2xl font-bold">${credibility}</div>
                <div class="text-xs text-zinc-500">Credibility</div>
            </div>
            <div>
                <div class="text-2xl font-bold">${userData.integrityScore || 60}</div>
                <div class="text-xs text-zinc-500">Integrity</div>
            </div>
        </div>

        <!-- Download Data Button -->
        <button onclick="downloadMyDataPDF()" 
                class="mt-8 w-full py-3 bg-zinc-800 hover:bg-zinc-700 border border-zinc-600 rounded-2xl flex items-center justify-center gap-2 text-sm font-medium">
            📄 Download My Data as PDF
        </button>
    `;
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
