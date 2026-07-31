// js/profile.js - Integrated, Refactored & Fully Localized Version
import { 
    onAuthStateChanged, 
    sendPasswordResetEmail,
    signOut 
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
import { t } from './i18n.js'; // Ensure t() helper is imported

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
            if (userUnsubscribe) {
                userUnsubscribe();
                userUnsubscribe = null;
            }
        }
    });

    // Helper function to sanitize untrusted strings before innerHTML injection
function sanitize(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
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
        
        // Safely format Firestore timestamp or handle pending serverTimestamp / raw strings
        const formattedDate = (userData.createdAt && typeof userData.createdAt.toDate === 'function')
            ? new Date(userData.createdAt.toDate()).toLocaleDateString()
            : t("common.recent", "Recent");

        const html = `
            <div class="space-y-8">
                <!-- Profile Header -->
                <div class="flex flex-col items-center text-center">
                    <div class="relative">
                        <div class="w-32 h-32 mx-auto rounded-3xl overflow-hidden border-4 border-zinc-700 shadow-2xl">
                            ${userData.photoURL ? 
                                `<img src="${sanitize(userData.photoURL)}" class="w-full h-full object-cover" alt="Profile Photo">` : 
                                `<div class="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-7xl">👤</div>`
                            }
                        </div>
                        ${isWitness ? `<div class="absolute -bottom-1 -right-1 text-3xl" title="${t("profile.active_witness", "Active Witness")}">🔐</div>` : ''}
                    </div>
                    
                    <h2 class="text-3xl font-bold mt-5 text-white">${sanitize(userData.displayName) || t("profile.anonymous_witness", "Anonymous Witness")}</h2>
                    <p class="text-emerald-400">@${sanitize(userData.username) || 'anonymous'}</p>
                    ${userData.region ? `<p class="text-xs text-zinc-400 mt-1">📍 ${sanitize(userData.region)}</p>` : ''}
                    
                    <!-- Tier Badge -->
                    <div class="mt-6">
                        ${level ? `
                            <div class="inline-flex items-center gap-3 px-6 py-3 bg-zinc-900 border border-zinc-700 rounded-3xl">
                                <span class="text-4xl">${level.emblem}</span>
                                <div class="text-left">
                                    <div class="font-bold text-lg text-white">${sanitize(level.name)}</div>
                                    <div class="text-xs text-zinc-400">${t("profile.level", "Level")} ${level.level} • ${userData.reputation || 0} REP</div>
                                </div>
                            </div>
                        ` : `
                            <div class="px-6 py-3 bg-zinc-800 rounded-3xl text-sm text-zinc-300">👤 ${t("profile.citizen", "Citizen")}</div>
                        `}
                    </div>
                </div>

                <!-- Witness Cycle Control Card -->
                <div class="bg-zinc-900 rounded-3xl p-6 border border-amber-500/20">
                    <div class="flex justify-between items-start mb-4">
                        <div>
                            <h4 class="font-semibold text-lg text-amber-400 flex items-center gap-2">
                                <span>🔄</span> ${t("profile.witness_cycle", "Witness Cycle")}
                            </h4>
                            <p class="text-xs text-zinc-400 mt-1">${t("profile.witness_cycle_desc", "Manage active attestation status in the public square.")}</p>
                        </div>
                        <span class="px-3 py-1 bg-amber-500/10 text-amber-400 text-xs font-mono rounded-full border border-amber-500/30">
                            ${userData.activeWitnessCycle ? t("common.active", "Active") : t("common.inactive", "Inactive")}
                        </span>
                    </div>

                    <div class="bg-zinc-950 rounded-2xl p-4 mb-4 flex items-center justify-between text-sm">
                        <span class="text-zinc-400">${t("profile.current_cycle_state", "Current Cycle State")}</span>
                        <span class="font-medium text-white">${userData.activeWitnessCycle ? t("profile.attesting", "Attesting in Square") : t("profile.not_attesting", "Not Attesting")}</span>
                    </div>

                    <button onclick="handleProfileStartCycle()" 
                            class="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10">
                        <span>🔄</span> ${userData.activeWitnessCycle ? t("profile.end_cycle", "End Witness Cycle") : t("profile.start_cycle", "Start Witness Cycle")}
                    </button>
                </div>

                <!-- Bio -->
                ${userData.bio ? `
                    <div class="bg-zinc-900/70 border border-zinc-700 rounded-3xl p-6 text-zinc-300">
                        ${sanitize(userData.bio)}
                    </div>
                ` : ''}

                <!-- Stats -->
                <div class="grid grid-cols-3 gap-4">
                    <div class="bg-zinc-900 rounded-3xl p-5 text-center">
                        <div class="text-3xl font-bold text-emerald-400">${userData.reputation || 0}</div>
                        <div class="text-xs text-zinc-500 mt-1">${t("profile.reputation", "Reputation")}</div>
                    </div>
                    <div class="bg-zinc-900 rounded-3xl p-5 text-center">
                        <div class="text-3xl font-bold text-white">${userData.testimoniesCount || 0}</div>
                        <div class="text-xs text-zinc-500 mt-1">${t("profile.testimonies", "Testimonies")}</div>
                    </div>
                    <div class="bg-zinc-900 rounded-3xl p-5 text-center">
                        <div class="text-3xl font-bold text-amber-400">${userData.verifications || 0}</div>
                        <div class="text-xs text-zinc-500 mt-1">${t("profile.verifications", "Verifications")}</div>
                    </div>
                </div>

                <!-- Security Status -->
                <div class="bg-zinc-900 rounded-3xl p-6">
                    <h4 class="font-semibold mb-4 flex items-center gap-2 text-white">
                        <span>🛡️</span> ${t("profile.security_status", "Security Status")}
                    </h4>
                    <div class="space-y-4 text-sm">
                        <div class="flex justify-between items-center">
                            <span class="text-zinc-400">${t("profile.phone_verification", "Phone Verification")}</span>
                            <span class="${userData.isPhoneVerified ? 'text-emerald-400' : 'text-zinc-500'}">
                                ${userData.isPhoneVerified ? '✓ ' + t("common.verified", "Verified") : t("common.not_verified", "Not Verified")}
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-zinc-400">${t("profile.zk_proof", "ZK Proof")}</span>
                            <span class="${userData.zkVerified ? 'text-amber-400' : 'text-zinc-500'}">
                                ${userData.zkVerified ? '✓ ' + t("common.verified", "Verified") : t("common.not_verified", "Not Verified")}
                            </span>
                        </div>
                        <div class="flex justify-between items-center">
                            <span class="text-zinc-400">${t("profile.account_created", "Account Created")}</span>
                            <span class="text-zinc-400">${formattedDate}</span>
                        </div>
                    </div>
                </div>

                <!-- Action Controls -->
                <div class="space-y-3">
                    <div class="flex gap-3">
                        <button onclick="openEditProfile()" 
                                class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 text-black font-semibold rounded-3xl transition">
                            ✏️ ${t("profile.edit_profile", "Edit Profile")}
                        </button>
                        <button onclick="exportUserDataPDF()" 
                                class="flex-1 py-4 bg-zinc-700 hover:bg-zinc-600 text-white font-semibold rounded-3xl transition">
                            📄 ${t("profile.export_data", "Export Data")}
                        </button>
                    </div>

                    <!-- Sign Out Button -->
                    <button onclick="handleSignOut()" 
                            class="w-full py-3.5 bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-400 hover:text-red-300 font-semibold rounded-2xl transition flex items-center justify-center gap-2">
                        <span>🚪</span> ${t("auth.sign_out", "Sign Out")}
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
        showToast(t("profile.error_loading", "Error loading profile data"), "error");
    });
}

}
// ====================== SIGN OUT HANDLER ======================
window.handleSignOut = async () => {
    try {
        showToast(t("auth.signing_out", "Signing out..."), "info");
        
        // 1. Immediately close active modals
        document.getElementById('profileModal')?.classList.add('hidden');
        document.getElementById('editProfileModal')?.classList.add('hidden');
        document.getElementById('settingsModal')?.classList.add('hidden');

        // 2. Clear listener subscription
        if (userUnsubscribe) {
            userUnsubscribe();
            userUnsubscribe = null;
        }

        // 3. Clear memory state
        currentUserData = null;
        window.currentUserData = null;

        // 4. Perform Firebase Auth Sign Out
        await signOut(auth);

        showToast(t("auth.signed_out_success", "Signed out successfully"), "success");

        // 5. Reload to return to public landing state
        window.location.reload();

    } catch (error) {
        console.error("Sign out error:", error);
        showToast(t("auth.sign_out_error", "Error signing out"), "error");
    }
};

// ====================== WITNESS CYCLE CONTROL ======================
window.handleProfileStartCycle = async () => {
    if (typeof startWitnessCycle === 'function') {
        await startWitnessCycle();
    } else {
        showToast(t("profile.cycle_module_unavailable", "Witness cycle module unavailable"), "error");
    }
};

// ====================== EDIT PROFILE MODAL ======================
window.openEditProfile = () => {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return showToast(t("profile.edit_modal_not_found", "Edit modal not found"), "error");

    if (currentUserData) {
        const displayNameInput = document.getElementById('editDisplayName');
        const usernameInput = document.getElementById('editUsername');
        const regionInput = document.getElementById('editRegion');
        const bioInput = document.getElementById('editBio');

        if (displayNameInput) displayNameInput.value = currentUserData.displayName || '';
        if (usernameInput) usernameInput.value = currentUserData.username || '';
        if (regionInput) regionInput.value = currentUserData.region || '';
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
    if (!auth.currentUser) return showToast(t("auth.must_be_logged_in", "You must be logged in"), "error");

    const displayName = document.getElementById('editDisplayName')?.value.trim();
    const username = document.getElementById('editUsername')?.value.trim();
    const region = document.getElementById('editRegion')?.value.trim();
    const bio = document.getElementById('editBio')?.value.trim();

    if (!displayName) return showToast(t("profile.display_name_required", "Display name is required"), "error");

    try {
        showToast(t("common.saving", "Saving changes..."), "info");
        const userRef = doc(db, "users", auth.currentUser.uid);
        
        await updateDoc(userRef, {
            displayName,
            username: username || null,
            region: region || null,
            bio: bio || null,
            updatedAt: serverTimestamp()
        });

        showToast("✅ " + t("profile.updated_success", "Profile updated successfully!"), "success");
        window.closeEditProfile();
        refreshTierAndUI?.();
    } catch (error) {
        console.error("Save profile error:", error);
        showToast(t("profile.failed_to_save", "Failed to save profile"), "error");
    }
};

// ====================== SETTINGS & SECURITY ======================
window.openSettings = () => {
    const modal = document.getElementById('settingsModal');
    if (!modal) return showToast(t("profile.settings_modal_not_found", "Settings modal not found"), "error");
    
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
        return showToast(t("auth.no_email_found", "No active user email found"), "error");
    }
    try {
        await sendPasswordResetEmail(auth, auth.currentUser.email);
        showToast("📧 " + t("auth.reset_email_sent", "Password reset email sent!"), "success");
    } catch (error) {
        console.error("Password reset error:", error);
        showToast(t("auth.reset_email_failed", "Failed to send reset email"), "error");
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
        showToast(isEnabled ? "🔒 " + t("profile.2fa_enabled", "2FA Enabled") : "🔓 " + t("profile.2fa_disabled", "2FA Disabled"), "info");
    } catch (error) {
        console.error("2FA toggle error:", error);
        showToast(t("profile.2fa_update_failed", "Failed to update 2FA preference"), "error");
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
        
        const formattedName = doorValue.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        showToast(`${t("profile.default_door_updated", "Default door updated to")} ${formattedName}`, "success");
    } catch (error) {
        console.error("Default door update error:", error);
        showToast(t("profile.default_door_failed", "Failed to save default door preference"), "error");
    }
};

// ====================== PDF EXPORT ======================
window.exportUserDataPDF = async () => {
    if (!currentUserData) return showToast(t("profile.data_not_loaded", "Profile data not loaded"), "error");
    showToast(t("profile.generating_pdf", "Generating identity PDF..."), "info");
    
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
        pdf.text(`Region: ${currentUserData.region || 'N/A'}`, 20, 60);
        pdf.text(`Reputation: ${currentUserData.reputation || 0} REP`, 20, 68);
        pdf.text(`Phone Verified: ${currentUserData.isPhoneVerified ? 'Yes' : 'No'}`, 20, 76);
        pdf.text(`ZK Verified: ${currentUserData.zkVerified ? 'Yes' : 'No'}`, 20, 84);
        
        pdf.save(`vocalwitness-identity-${auth.currentUser?.uid || 'user'}.pdf`);
        showToast("✅ " + t("profile.pdf_exported", "Identity PDF Exported!"), "success");
    } catch (e) {
        console.error("Export error:", e);
        showToast(t("profile.jspdf_required", "PDF generation requires jsPDF script inclusion"), "error");
    }
};

// Backwards compatibility alias
window.downloadMyDataPDF = window.exportUserDataPDF;

// ====================== MODAL CONTROL ALIASES ======================
window.openProfile = function() {
    const modal = document.getElementById('profileModal');
    if (!modal) return showToast(t("profile.modal_not_found", "Profile modal not found"), "error");
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
