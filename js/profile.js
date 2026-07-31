// js/profile.js - Integrated & Refactored Version
import { 
    onAuthStateChanged, 
    sendPasswordResetEmail 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { 
    doc, 
    onSnapshot, 
    updateDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { refreshTierAndUI, getCurrentWitnessLevel } from './tier.js';
import { startWitnessCycle } from './witnessCycle.js';

let currentUserData = null;
let userUnsubscribe = null;
window.currentUserData = null;

/**
 * Initialize Profile Listener & State
 */
export function initProfile() {
    if (userUnsubscribe) userUnsubscribe();
    
    onAuthStateChanged(auth, (user) => {
        if (user) {
            listenToUserProfile(user.uid);
        } else {
            currentUserData = null;
            window.currentUserData = null;
            userUnsubscribe = null;
        }
    });
}

/**
 * Real-time Firestore user document listener
 */
function listenToUserProfile(userId) {
    const userRef = doc(db, "users", userId);
    userUnsubscribe = onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            currentUserData = snapshot.data();
            window.currentUserData = currentUserData;
            renderProfileUI(currentUserData);
            refreshTierAndUI?.();
        } else {
            console.warn("User profile document does not exist yet.");
        }
    }, (error) => {
        console.error("Profile Firestore Error:", error);
        showToast("Error loading profile data", "error");
    });
}

// ====================== RENDER UI ======================
function renderProfileUI(userData) {
    if (!userData) return;
    
    // Target containers across embedded page views and overlay modals
    const targets = [
        document.getElementById('mainProfileContent'),
        document.getElementById('modalProfileContent'),
        document.getElementById('profileContent')
    ].filter(Boolean);

    if (targets.length === 0) return;

    getCurrentWitnessLevel().then(level => {
        const isWitness = level !== null;
        
        const html = `
            <div class="space-y-8">
                <!-- Profile Header -->
                <div class="flex flex-col items-center text-center">
                    <div class="relative">
                        <div class="w-32 h-32 mx-auto rounded-3xl overflow-hidden border-4 border-zinc-700 shadow-2xl">
                            ${userData.photoURL ? 
                                `<img src="${userData.photoURL}" class="w-full h-full object-cover" alt="Profile Photo">` : 
                                `<div class="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-7xl">👤</div>`
                            }
                        </div>
                        ${isWitness ? `<div class="absolute -bottom-1 -right-1 text-3xl" title="Active Witness">🔐</div>` : ''}
                    </div>
                    
                    <h2 class="text-3xl font-bold mt-5 text-white">${userData.displayName || "Anonymous Witness"}</h2>
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
                            <div class="px-6 py-3 bg-zinc-800 rounded-3xl text-sm text-zinc-300">👤 Citizen</div>
                        `}
                    </div>
                </div>

                <!-- Witness Cycle Control Card -->
                <div class="bg-zinc-900 rounded-3xl p-6 border border-amber-500/20">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h4 class="font-semibold text-lg text-amber-400 flex items-center gap-2">
                                <span>🔄</span> Witness Cycle
                            </h4>
                            <p class="text-xs text-zinc-400 mt-1">Manage active attestation status in the public square.</p>
                        </div>
                        <span class="px-3 py-1 bg-amber-500/10 text-amber-400 text-xs font-mono rounded-full border border-amber-500/30">
                            ${userData.activeWitnessCycle ? 'Active' : 'Inactive'}
                        </span>
                    </div>

                    <div class="bg-zinc-950 rounded-2xl p-4 mb-4 flex items-center justify-between text-sm">
                        <span class="text-zinc-400">Current Cycle State</span>
                        <span class="font-medium text-white">${userData.activeWitnessCycle ? 'Attesting in Square' : 'Not Attesting'}</span>
                    </div>

                    <button onclick="handleProfileStartCycle()" 
                            class="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10">
                        <span>🔄</span> ${userData.activeWitnessCycle ? 'End Witness Cycle' : 'Start Witness Cycle'}
                    </button>
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
                        <div class="text-3xl font-bold text-white">${userData.testimoniesCount || 0}</div>
                        <div class="text-xs text-zinc-500 mt-1">Testimonies</div>
                    </div>
                    <div class="bg-zinc-900 rounded-3xl p-5 text-center">
                        <div class="text-3xl font-bold text-amber-400">${userData.verifications || 0}</div>
                        <div class="text-xs text-zinc-500 mt-1">Verifications</div>
                    </div>
                </div>

                <!-- Security Status -->
                <div class="bg-zinc-900 rounded-3xl p-6">
                    <h4 class="font-semibold mb-4 flex items-center gap-2 text-white">
                        <span>🛡️</span> Security Status
                    </h4>
                    <div class="space-y-4 text-sm">
                        <div class="flex justify-between items-center">
                            <span class="text-zinc-400">Phone Verification</span>
                            <span class="${userData.isPhoneVerified ? 'text-emerald-400' : 'text-zinc-500'}">
                                ${userData.isPhoneVerified ? '✓ Verified' : 'Not Verified'}
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-zinc-400">ZK Proof</span>
                            <span class="${userData.zkVerified ? 'text-amber-400' : 'text-zinc-500'}">
                                ${userData.zkVerified ? '✓ Verified' : 'Not Verified'}
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-zinc-400">Account Created</span>
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
                    <button onclick="exportUserDataPDF()" 
                            class="flex-1 py-4 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-3xl transition">
                        📄 Export Data
                    </button>
                </div>
            </div>
        `;

        targets.forEach(container => {
            container.innerHTML = html;
        });

    }).catch(err => {
        console.error("Error computing witness level:", err);
    });
}

// ====================== WITNESS CYCLE CONTROL ======================
window.handleProfileStartCycle = async () => {
    if (typeof startWitnessCycle === 'function') {
        await startWitnessCycle();
    } else {
        showToast("Witness cycle module unavailable", "error");
    }
};

// ====================== EDIT PROFILE MODAL ======================
window.openEditProfile = () => {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return showToast("Edit modal not found", "error");

    if (currentUserData) {
        const displayNameInput = document.getElementById('editDisplayName');
        const usernameInput = document.getElementById('editUsername');
        const bioInput = document.getElementById('editBio');

        if (displayNameInput) displayNameInput.value = currentUserData.displayName || '';
        if (usernameInput) usernameInput.value = currentUserData.username || '';
        if (bioInput) bioInput.value = currentUserData.bio || '';
    }
    modal.classList.remove('hidden');
};

window.closeEditProfile = () => {
    document.getElementById('editProfileModal')?.classList.add('hidden');
};

window.handleSaveProfile = async (event) => {
    if (event) event.preventDefault();
    await window.saveProfileChanges();
};

window.saveProfileChanges = async () => {
    if (!auth.currentUser) return showToast("You must be logged in", "error");

    const displayName = document.getElementById('editDisplayName')?.value.trim();
    const username = document.getElementById('editUsername')?.value.trim();
    const bio = document.getElementById('editBio')?.value.trim();

    if (!displayName) return showToast("Display name is required", "error");

    try {
        showToast("Saving changes...", "info");
        const userRef = doc(db, "users", auth.currentUser.uid);
        
        await updateDoc(userRef, {
            displayName,
            username: username || null,
            bio: bio || null,
            updatedAt: serverTimestamp()
        });

        showToast("✅ Profile updated successfully!", "success");
        window.closeEditProfile();
        refreshTierAndUI?.();
    } catch (error) {
        console.error("Save profile error:", error);
        showToast("Failed to save profile", "error");
    }
};

// ====================== SETTINGS & SECURITY ======================
window.openSettings = () => {
    const modal = document.getElementById('settingsModal');
    if (!modal) return showToast("Settings modal not found", "error");
    
    if (currentUserData) {
        const toggle2FA = document.getElementById('toggle2FA');
        const defaultDoor = document.getElementById('defaultDoorSelect');
        
        if (toggle2FA) toggle2FA.checked = currentUserData.enable2FA === true;
        if (defaultDoor) defaultDoor.value = currentUserData.defaultDoor || 'public_square';
    }
    
    modal.classList.remove('hidden');
};

window.closeSettings = () => {
    document.getElementById('settingsModal')?.classList.add('hidden');
};

window.triggerPasswordReset = async () => {
    if (!auth.currentUser || !auth.currentUser.email) {
        return showToast("No active user email found", "error");
    }
    try {
        await sendPasswordResetEmail(auth, auth.currentUser.email);
        showToast("📧 Password reset email sent!", "success");
    } catch (error) {
        console.error("Password reset error:", error);
        showToast("Failed to send reset email", "error");
    }
};

window.handle2FAToggle = async (e) => {
    if (!auth.currentUser) return;
    const isEnabled = e.target.checked;
    
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
            enable2FA: isEnabled,
            updatedAt: serverTimestamp()
        });
        showToast(isEnabled ? "🔒 2FA Enabled" : "🔓 2FA Disabled", "info");
    } catch (error) {
        console.error("2FA toggle error:", error);
        showToast("Failed to update 2FA preference", "error");
    }
};

window.updateDefaultDoor = async (doorValue) => {
    if (!auth.currentUser) return;
    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
            defaultDoor: doorValue,
            updatedAt: serverTimestamp()
        });
        
        // Format name for toast presentation
        const formattedName = doorValue.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        showToast(`Default door updated to ${formattedName}`, "success");
    } catch (error) {
        console.error("Default door update error:", error);
        showToast("Failed to save default door preference", "error");
    }
};

// ====================== PDF EXPORT ======================
window.exportUserDataPDF = async () => {
    if (!currentUserData) return showToast("Profile data not loaded", "error");
    showToast("Generating identity PDF...", "info");
    
    try {
        if (!window.jspdf) throw new Error("jsPDF library not loaded");
        
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        
        pdf.setFontSize(20);
        pdf.text("VocalWitness Identity & Profile Record", 20, 20);
        
        pdf.setFontSize(12);
        pdf.text(`Generated: ${new Date().toLocaleString()}`, 20, 32);
        pdf.text(`Display Name: ${currentUserData.displayName || 'N/A'}`, 20, 44);
        pdf.text(`Username: @${currentUserData.username || 'anonymous'}`, 20, 52);
        pdf.text(`Reputation: ${currentUserData.reputation || 0} REP`, 20, 60);
        pdf.text(`Phone Verified: ${currentUserData.isPhoneVerified ? 'Yes' : 'No'}`, 20, 68);
        pdf.text(`ZK Verified: ${currentUserData.zkVerified ? 'Yes' : 'No'}`, 20, 76);
        
        pdf.save(`vocalwitness-identity-${auth.currentUser?.uid || 'user'}.pdf`);
        showToast("✅ Identity PDF Exported!", "success");
    } catch (e) {
        console.error("Export error:", e);
        showToast("PDF generation requires jsPDF script inclusion", "error");
    }
};

// Backwards compatibility alias
window.downloadMyDataPDF = window.exportUserDataPDF;

// ====================== MODAL CONTROL ALIASES ======================
window.openProfile = function() {
    const modal = document.getElementById('profileModal');
    if (!modal) return showToast("Profile modal not found", "error");
    modal.classList.remove('hidden');
    if (currentUserData) renderProfileUI(currentUserData);
};

window.closeProfile = function() {
    document.getElementById('profileModal')?.classList.add('hidden');
};

// Listening for language switches across views
window.addEventListener('languageChanged', () => {
    if (currentUserData) renderProfileUI(currentUserData);
});
