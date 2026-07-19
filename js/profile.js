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
            window.currentUserData = currentUserData; // ← This makes it global
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

    getCurrentWitnessLevel().then(level => {
        const isWitness = level !== null;
        
        content.innerHTML = `
            <div class="space-y-8">
                <!-- Profile Header -->
                <div class="flex flex-col items-center text-center">
                    <div class="relative">
                        <div class="w-32 h-32 mx-auto rounded-3xl overflow-hidden border-4 border-zinc-700 shadow-2xl">
                            ${userData.photoURL ? 
                                `<img src="${userData.photoURL}" class="w-full h-full object-cover">` : 
                                `<div class="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-7xl">👤</div>`
                            }
                        </div>
                        ${isWitness ? `<div class="absolute -bottom-1 -right-1 text-3xl">🔐</div>` : ''}
                    </div>
                    
                    <h2 class="text-3xl font-bold mt-5">${userData.displayName || "Anonymous Witness"}</h2>
                    <p class="text-emerald-400">@${userData.username || 'anonymous'}</p>
                    
                    <!-- Tier Badge -->
                    <div class="mt-6">
                        ${level ? `
                            <div class="inline-flex items-center gap-3 px-6 py-3 bg-zinc-900 border border-zinc-700 rounded-3xl">
                                <span class="text-4xl">${level.emblem}</span>
                                <div class="text-left">
                                    <div class="font-bold text-lg text-white">${level.name}</div>
                                    <div class="text-xs text-zinc-400">Level ${level.level} • ${userData.reputation || 0} REP</div>
                                </div>
                            </div>
                        ` : `
                            <div class="px-6 py-3 bg-zinc-800 rounded-3xl text-sm">👤 Citizen</div>
                        `}
                    </div>
                </div>

                <!-- Bio -->
                ${userData.bio ? `
                    <div class="bg-zinc-900/70 border border-zinc-700 rounded-3xl p-6 text-zinc-300">
                        ${userData.bio}
                    </div>
                ` : ''}

                <!-- Stats -->
                <div class="grid grid-cols-3 gap-4">
                    <div class="bg-zinc-900 rounded-3xl p-5 text-center">
                        <div class="text-3xl font-bold text-emerald-400">${userData.reputation || 0}</div>
                        <div class="text-xs text-zinc-500 mt-1">Reputation</div>
                    </div>
                    <div class="bg-zinc-900 rounded-3xl p-5 text-center">
                        <div class="text-3xl font-bold">${userData.testimoniesCount || 0}</div>
                        <div class="text-xs text-zinc-500 mt-1">Testimonies</div>
                    </div>
                    <div class="bg-zinc-900 rounded-3xl p-5 text-center">
                        <div class="text-3xl font-bold text-amber-400">${userData.verifications || 0}</div>
                        <div class="text-xs text-zinc-500 mt-1">Verifications</div>
                    </div>
                </div>

                <!-- Security Status -->
                <div class="bg-zinc-900 rounded-3xl p-6">
                    <h4 class="font-semibold mb-4 flex items-center gap-2">
                        <span>🛡️</span> Security Status
                    </h4>
                    <div class="space-y-4 text-sm">
                        <div class="flex justify-between items-center">
                            <span>Phone Verification</span>
                            <span class="${userData.isPhoneVerified ? 'text-emerald-400' : 'text-zinc-500'}">
                                ${userData.isPhoneVerified ? '✓ Verified' : 'Not Verified'}
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span>ZK Proof</span>
                            <span class="${userData.zkVerified ? 'text-amber-400' : 'text-zinc-500'}">
                                ${userData.zkVerified ? '✓ Verified' : 'Not Verified'}
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span>Account Created</span>
                            <span class="text-zinc-400">${userData.createdAt ? new Date(userData.createdAt.toDate()).toLocaleDateString() : 'Recent'}</span>
                        </div>
                    </div>
                </div>

                <!-- Quick Actions -->
                <div class="flex gap-3">
                    <button onclick="openEditProfile()" 
                            class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-black font-semibold rounded-3xl transition">
                        ✏️ Edit Profile
                    </button>
                    <button onclick="downloadMyDataPDF()" 
                            class="flex-1 py-4 bg-zinc-700 hover:bg-zinc-600 font-semibold rounded-3xl transition">
                        📄 Export Data
                    </button>
                </div>
            </div>
        `;
    }).catch(console.error);
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

// ====================== SETTINGS FUNCTIONALITY ======================
let currentSettingsUnsubscribe = null;

window.openSettings = () => {
    const modal = document.getElementById('settingsModal');
    if (!modal) {
        return showToast("Settings modal not found in HTML", "error");
    }
   
    modal.classList.remove('hidden');
    loadSettingsContent();
};

window.closeSettings = () => {
    document.getElementById('settingsModal')?.classList.add('hidden');
};

function loadSettingsContent() {
    const container = document.getElementById('settingsContent');
    if (!container) return;
    container.innerHTML = `
        <div class="space-y-6">
            <!-- Account & Security -->
            <div class="p-5 bg-zinc-900 rounded-2xl">
                <div class="font-medium text-lg mb-3">🔐 Account & Security</div>
                <button onclick="deleteAccountConfirm()"
                        class="w-full py-3 bg-red-900/30 hover:bg-red-900/50 text-red-400 rounded-2xl text-sm font-medium">
                    Delete My Account
                </button>
            </div>
            <!-- Privacy -->
            <div class="p-5 bg-zinc-900 rounded-2xl">
                <div class="font-medium text-lg mb-3">🔒 Privacy & Visibility</div>
                <div class="flex items-center justify-between py-3">
                    <div>
                        <div class="font-medium">Public Profile</div>
                        <div class="text-sm text-zinc-500">Allow others to see my profile</div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="publicProfileToggle" onchange="togglePublicProfile(this)"
                               class="sr-only peer">
                        <div class="w-11 h-6 bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                </div>
            </div>
            <!-- Notifications -->
            <div class="p-5 bg-zinc-900 rounded-2xl">
                <div class="font-medium text-lg mb-3">🛎️ Notifications</div>
                <div class="flex items-center justify-between py-3">
                    <div>
                        <div class="font-medium">Reply & Mention Alerts</div>
                    </div>
                    <label class="relative inline-flex items-center cursor-pointer">
                        <input type="checkbox" id="notifyToggle" onchange="toggleNotifications(this)"
                               class="sr-only peer">
                        <div class="w-11 h-6 bg-zinc-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                    </label>
                </div>
            </div>
        </div>
    `;
    // Load current user settings
    loadCurrentUserSettings();
}

function loadCurrentUserSettings() {
    if (!currentUserData) return;
   
    const publicToggle = document.getElementById('publicProfileToggle');
    const notifyToggle = document.getElementById('notifyToggle');
   
    if (publicToggle) publicToggle.checked = currentUserData.isPublic !== false;
    if (notifyToggle) notifyToggle.checked = currentUserData.notifyReplies !== false;
}

// Toggle functions
window.togglePublicProfile = async (checkbox) => {
    if (!auth.currentUser) return;
    try {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            isPublic: checkbox.checked,
            updatedAt: serverTimestamp()
        });
        showToast("Privacy updated", "success");
    } catch (e) {
        showToast("Failed to update", "error");
        checkbox.checked = !checkbox.checked;
    }
};

window.toggleNotifications = async (checkbox) => {
    if (!auth.currentUser) return;
    try {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            notifyReplies: checkbox.checked,
            updatedAt: serverTimestamp()
        });
        showToast("Notification preference saved", "success");
    } catch (e) {
        showToast("Failed to update", "error");
        checkbox.checked = !checkbox.checked;
    }
};

window.deleteAccountConfirm = () => {
    if (confirm("⚠️ This will permanently delete your account and all testimonies.\n\nAre you sure?")) {
        if (confirm("FINAL WARNING: This action cannot be undone. Type 'DELETE' to confirm:")) {
            // TODO: Implement actual delete logic later (Cloud Function recommended)
            showToast("Account deletion - coming in next update", "info");
        }
    }
};
