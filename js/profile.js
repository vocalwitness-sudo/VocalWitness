// js/profile.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { doc, onSnapshot, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { refreshTierAndUI } from './tier.js';

let currentUserData = null;

export function initProfile() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            listenToUserProfile(user.uid);
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

    const content = document.getElementById('profileContent');
    if (content) {
        content.innerHTML = `
            <div class="text-center">
                <div class="w-24 h-24 mx-auto bg-gradient-to-br from-emerald-500 to-teal-500 rounded-3xl flex items-center justify-center text-5xl mb-4">
                    👤
                </div>
                <h3 id="profileName" class="text-2xl font-bold">${userData.displayName || "Anonymous Witness"}</h3>
                <p id="profileUsername" class="text-emerald-400">@${userData.username || 'user_' + (userData.uid || '').slice(0,6)}</p>
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
}

// Modal Controls
window.showProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) {
        modal.classList.remove('hidden');
        if (currentUserData) renderProfileUI(currentUserData);
    }
};

window.closeProfile = () => {
    document.getElementById('profileModal').classList.add('hidden');
};

window.editProfile = () => {
    const modal = document.getElementById('editProfileModal');
    if (!modal || !currentUserData) {
        showToast("Profile data not loaded", "error");
        return;
    }

    document.getElementById('editDisplayName').value = currentUserData.displayName || "";
    document.getElementById('editUsername').value = currentUserData.username || "";
    document.getElementById('editBio').value = currentUserData.bio || "";

    modal.classList.remove('hidden');
};

window.closeEditProfile = () => {
    document.getElementById('editProfileModal').classList.add('hidden');
};

window.saveProfileChanges = async () => {
    const user = auth.currentUser;
    if (!user) {
        showToast("You must be logged in", "error");
        return;
    }

    const newDisplayName = document.getElementById('editDisplayName').value.trim();
    const newUsername = document.getElementById('editUsername').value.trim().toLowerCase();
    const newBio = document.getElementById('editBio').value.trim();

    try {
        const userRef = doc(db, "users", user.uid);
        await updateDoc(userRef, {
            displayName: newDisplayName || "Anonymous Witness",
            username: newUsername || null,
            bio: newBio || null,
            updatedAt: serverTimestamp()
        });

        showToast("✅ Profile updated successfully", "success");
        closeEditProfile();
    } catch (error) {
        console.error(error);
        showToast("Failed to save changes", "error");
    }
};

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
