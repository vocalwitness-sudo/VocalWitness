// js/profile.js - Integrated, Refactored & Extended Version
// Handles modal layering, multi-field form persistence, image upload preview, and legacy alias bindings
// Updated: Better Bio editing + Safe Edit/Settings buttons

import {  
    onAuthStateChanged,  
    sendPasswordResetEmail, 
    signOut  
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js"; 
import {  
    doc,  
    getDoc,
    setDoc,
    onSnapshot,  
    updateDoc,  
    serverTimestamp  
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js"; 

import { auth, db } from './firebase-config.js'; 
import { showToast } from './utils.js'; 
import { refreshTierAndUI, getCurrentWitnessLevel } from './tier.js'; 
import { startWitnessCycle } from './witnessCycle.js'; 
import { t } from './i18n.js'; 
import { startPhoneVerification } from './verification.js';

let currentUserData = null; 
let userUnsubscribe = null; 
let pendingAvatarBase64 = null;
window.currentUserData = null; 

// Helper function to sanitize untrusted strings
function sanitize(str) { 
    if (!str) return ''; 
    return String(str) 
        .replace(/&/g, "&amp;") 
        .replace(/</g, "&lt;") 
        .replace(/>/g, "&gt;") 
        .replace(/"/g, "&quot;") 
        .replace(/'/g, "&#039;"); 
} 

// ====================== OPEN / CLOSE MAIN PROFILE MODAL ======================
export function openProfile() {
    const modal = document.getElementById('profileModal');
    if (!modal) {
        showToast(t("profile.modal_not_found", "Profile modal not found"), "error");
        return;
    }

    if (currentUserData) {
        renderProfileUI(currentUserData);
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.style.display = 'flex';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
    modal.style.zIndex = '9000';
    modal.setAttribute('aria-hidden', 'false');
}

export function closeProfile() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;

    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.style.display = 'none';
    modal.style.visibility = 'hidden';
    modal.setAttribute('aria-hidden', 'true');
}

/** 
 * Initialize Profile Listener & State 
 */ 
export function initProfile() { 
    if (userUnsubscribe) userUnsubscribe(); 
     
    onAuthStateChanged(auth, async (user) => { 
        if (user) { 
            await ensureUserProfile(user); 
        } else { 
            currentUserData = null; 
            window.currentUserData = null; 
            if (userUnsubscribe) { 
                userUnsubscribe(); 
                userUnsubscribe = null; 
            } 
        } 
    }); 
}

/**
 * Ensures user document exists in Firestore
 */
async function ensureUserProfile(user) {
    try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        
        if (!snap.exists()) {
            console.log("New user detected. Provisioning profile...");
            await setDoc(userRef, {
                email: user.email || "",
                displayName: user.displayName || "",
                firstName: "",
                lastName: "",
                photoURL: user.photoURL || "",
                username: user.email ? user.email.split('@')[0] : `user_${user.uid.substring(0, 6)}`,
                region: "",
                bio: "",
                reputation: 0,
                testimoniesCount: 0,
                verifications: 0,
                isPhoneVerified: false,
                hasVerifiedPhone: false,
                zkVerified: false,
                activeWitnessCycle: false,
                hidePublicInfo: true,
                tier: "citizen",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        
        listenToUserProfile(user.uid);
    } catch (error) {
        console.error("Error provisioning user profile:", error);
        showToast(t("profile.error_loading", "Error initializing profile"), "error");
    }
}

/** 
 * Real-time Firestore user document listener 
 */ 
function listenToUserProfile(userId) { 
    if (userUnsubscribe) userUnsubscribe();

    const userRef = doc(db, "users", userId); 
    userUnsubscribe = onSnapshot(userRef, (snapshot) => { 
        if (snapshot.exists()) { 
            currentUserData = snapshot.data(); 
            window.currentUserData = currentUserData; 
            renderProfileUI(currentUserData); 
            if (typeof refreshTierAndUI === 'function') refreshTierAndUI(); 
        } 
    }, (error) => { 
        console.error("Profile Firestore Error:", error); 
    }); 
} 

// ====================== RENDER UI ====================== 
export function renderProfileUI(userData, retryCount = 0) { 
    if (!userData) return; 
     
    const targets = [ 
        document.getElementById('mainProfileContent'), 
        document.getElementById('modalProfileContent'), 
        document.getElementById('profileContent') 
    ].filter(Boolean); 

    if (targets.length === 0) {
        if (retryCount < 3) {
            setTimeout(() => renderProfileUI(userData, retryCount + 1), 50);
            return;
        }
        return; 
    }

    const witnessPromise = typeof getCurrentWitnessLevel === 'function' 
        ? getCurrentWitnessLevel() 
        : Promise.resolve(null);

    witnessPromise.then(level => { 
        const isWitness = level !== null; 
        const isCitizenCircle = userData.isPhoneVerified || userData.hasVerifiedPhone || userData.tier === 'citizen_circle';
         
        const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(" ");
        const isPrivacyShieldActive = userData.hidePublicInfo !== false;

        const html = ` 
            <div class="space-y-5 p-1 text-white"> 

                <!-- Profile Header --> 
                <div class="flex flex-col items-center text-center"> 
                    <div class="relative"> 
                        <div class="w-24 h-24 mx-auto rounded-3xl overflow-hidden border-4 border-zinc-700 shadow-2xl bg-zinc-800"> 
                            ${userData.photoURL ?  
                                `<img src="${sanitize(userData.photoURL)}" class="w-full h-full object-cover" alt="Profile Photo">` :  
                                `<div class="w-full h-full flex items-center justify-center text-5xl">👤</div>` 
                            } 
                        </div> 
                        ${isWitness ? `<div class="absolute -bottom-1 -right-1 text-2xl">🔐</div>` : ''} 
                    </div> 
                     
                    <h2 class="text-xl font-bold mt-3 text-white">${sanitize(userData.displayName) || "Anonymous Witness"}</h2> 
                    
                    ${fullName ? `<p class="text-xs font-semibold text-zinc-300 mt-0.5">${sanitize(fullName)} ${isPrivacyShieldActive ? '<span class="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full ml-1">🛡️ Private</span>' : ''}</p>` : ''}

                    <p class="text-emerald-400 font-mono text-sm mt-1">@${sanitize(userData.username) || 'anonymous'}</p> 
                    ${userData.region ? `<p class="text-xs text-zinc-400 mt-1">📍 ${sanitize(userData.region)}</p>` : ''} 
                     
                    <!-- Tier Badge --> 
                    <div class="mt-3 flex flex-wrap justify-center gap-2"> 
                        ${level ? ` 
                            <div class="inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-zinc-700 rounded-2xl"> 
                                <span class="text-2xl">${level.emblem}</span> 
                                <div class="text-left"> 
                                    <div class="font-bold text-sm text-white">${sanitize(level.name)}</div> 
                                    <div class="text-xs text-zinc-400">Level ${level.level} • ${userData.reputation || 0} REP</div> 
                                </div> 
                            </div> 
                        ` : isCitizenCircle ? `
                            <div class="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl">
                                <span class="text-xl">🛡️</span>
                                <div class="text-left">
                                    <div class="font-bold text-sm text-emerald-400">Citizen Circle</div>
                                    <div class="text-xs text-zinc-400">Phone Verified • ${userData.reputation || 60} REP</div>
                                </div>
                            </div>
                        ` : ` 
                            <div class="px-4 py-2 bg-zinc-800 rounded-2xl text-xs text-zinc-300">
                                👤 Citizen (Unverified)
                            </div> 
                        `} 

                        ${userData.zkVerified ? `
                            <div class="inline-flex items-center gap-1.5 px-3 py-2 bg-teal-500/10 border border-teal-500/30 rounded-2xl text-xs text-teal-400 font-medium">
                                <span>🔑</span> ZK-Proof
                            </div>
                        ` : ''}
                    </div> 
                </div> 

                <!-- Witness Cycle --> 
                <div class="bg-zinc-900 rounded-2xl p-4 border border-amber-500/20"> 
                    <div class="flex justify-between items-start mb-3"> 
                        <div> 
                            <h4 class="font-semibold text-sm text-amber-400 flex items-center gap-2"> 
                                <span>🔄</span> Witness Cycle 
                            </h4> 
                            <p class="text-xs text-zinc-400 mt-0.5">Participate in active testimony attestation cycles.</p> 
                        </div> 
                        <span class="px-2.5 py-1 bg-amber-500/10 text-amber-400 text-xs font-mono rounded-full border border-amber-500/30"> 
                            ${userData.activeWitnessCycle ? 'Active' : 'Inactive'} 
                        </span> 
                    </div> 
                    <button onclick="handleProfileStartCycle()"  
                            class="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl transition text-sm"> 
                        ${userData.activeWitnessCycle ? 'End Witness Cycle' : 'Start Witness Cycle'} 
                    </button> 
                </div> 

                <!-- ========== IMPROVED BIO SECTION ========== -->
                <div class="bg-zinc-900/80 border border-zinc-700 rounded-2xl p-4">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Bio</h4>
                        <button onclick="toggleBioEdit()" 
                                class="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition">
                            Edit
                        </button>
                    </div>
                    
                    <div id="bioDisplay" class="text-sm text-zinc-300 leading-relaxed min-h-[52px]">
                        ${userData.bio 
                            ? sanitize(userData.bio) 
                            : `<span class="text-zinc-500 italic">Tell the Square who you are... Share your story, values, or what truth means to you.</span>`}
                    </div>
                    
                    <div id="bioEditSection" class="hidden space-y-3 mt-2">
                        <textarea id="profileBioTextarea" 
                                  rows="3"
                                  maxlength="280"
                                  class="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 resize-none"
                                  placeholder="Write a short bio about yourself... What do you stand for?">${sanitize(userData.bio || '')}</textarea>
                        <div class="flex gap-2">
                            <button onclick="saveUserBio()" 
                                    class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-semibold rounded-xl transition">
                                Save Bio
                            </button>
                            <button onclick="cancelBioEdit()" 
                                    class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-xl transition">
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>

                <!-- Stats --> 
                <div class="grid grid-cols-3 gap-3"> 
                    <div class="bg-zinc-900 rounded-2xl p-3 text-center"> 
                        <div class="text-xl font-bold text-emerald-400">${userData.reputation || 0}</div> 
                        <div class="text-xs text-zinc-500 mt-1">Reputation</div> 
                    </div> 
                    <div class="bg-zinc-900 rounded-2xl p-3 text-center"> 
                        <div class="text-xl font-bold text-white">${userData.testimoniesCount || 0}</div> 
                        <div class="text-xs text-zinc-500 mt-1">Testimonies</div> 
                    </div> 
                    <div class="bg-zinc-900 rounded-2xl p-3 text-center"> 
                        <div class="text-xl font-bold text-amber-400">${userData.verifications || 0}</div> 
                        <div class="text-xs text-zinc-500 mt-1">Verifications</div> 
                    </div> 
                </div> 

                <!-- Action Buttons --> 
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2"> 
                    ${!isCitizenCircle && !isWitness ? `
                        <button onclick="window.startPhoneVerification()"
                                class="col-span-1 sm:col-span-2 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2">
                            🛡️ Get Verified — Unlock Citizen Circle
                        </button>
                    ` : ''}

                    <button onclick="openEditProfileSafe()"  
                            class="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2"> 
                        ✏️ Edit Profile 
                    </button> 

                    <button onclick="openSettingsSafe()"  
                            class="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2"> 
                        ⚙️ Settings & Security 
                    </button> 

                    <button onclick="handleSignOut()"  
                            class="col-span-1 sm:col-span-2 py-3 px-4 bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-400 hover:text-red-300 text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2"> 
                        🚪 Sign Out 
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

// ====================== BIO EDIT HELPERS ======================
window.toggleBioEdit = function() {
    const display = document.getElementById('bioDisplay');
    const edit = document.getElementById('bioEditSection');
    if (display && edit) {
        display.classList.add('hidden');
        edit.classList.remove('hidden');
        document.getElementById('profileBioTextarea')?.focus();
    }
};

window.cancelBioEdit = function() {
    const display = document.getElementById('bioDisplay');
    const edit = document.getElementById('bioEditSection');
    if (display && edit) {
        display.classList.remove('hidden');
        edit.classList.add('hidden');
    }
};

window.saveUserBio = async function() {
    const textarea = document.getElementById('profileBioTextarea');
    if (!textarea || !auth.currentUser) return;

    const bioText = textarea.value.trim().slice(0, 280);

    try {
        showToast("Saving bio...", "info");
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, {
            bio: bioText || null,
            updatedAt: serverTimestamp()
        });

        showToast("✅ Bio saved successfully!", "success");
        cancelBioEdit();

        if (currentUserData) {
            currentUserData.bio = bioText;
            renderProfileUI(currentUserData);
        }
    } catch (err) {
        console.error("Bio save error:", err);
        showToast("Failed to save bio", "error");
    }
};

// ====================== SAFE MODAL OPENERS ======================
window.openEditProfileSafe = function() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        openEditProfile();
        return;
    }
    
    // Fallback when editProfileModal is missing
    showToast("Opening quick bio editor...", "info");
    toggleBioEdit();
};

window.openSettingsSafe = function() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        openSettings();
        return;
    }
    
    showToast("Settings & Security panel is being improved. Coming soon!", "info");
};

// ====================== IMAGE UPLOAD ======================
// ====================== IMAGE UPLOAD ======================
export function handleImagePreview(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
        showToast("Image size must be under 2MB", "error");
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 256;
            const MAX_HEIGHT = 256;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width *= MAX_HEIGHT / height;
                    height = MAX_HEIGHT;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Compress to JPEG Base64 (keeps Firestore docs small)
            pendingAvatarBase64 = canvas.toDataURL('image/jpeg', 0.8);

            const imgPreview = document.getElementById('avatarPreview');
            const fallback = document.getElementById('avatarFallback');
            if (imgPreview) {
                imgPreview.src = pendingAvatarBase64;
                imgPreview.classList.remove('hidden');
            }
            if (fallback) fallback.classList.add('hidden');
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
// ====================== SIGN OUT ====================== 
export async function handleSignOut() { 
    try { 
        showToast("Signing out...", "info"); 
        
        if (userUnsubscribe) { 
            userUnsubscribe(); 
            userUnsubscribe = null; 
        } 
        
        document.querySelectorAll('.modal, [id$="Modal"]').forEach(modal => {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        });

        currentUserData = null; 
        window.currentUserData = null; 
        
        await signOut(auth); 
        window.location.href = '/'; 
    } catch (error) { 
        console.error("Sign out error:", error); 
        showToast("Error signing out", "error"); 
    } 
} 

// ====================== OTHER CONTROLS ====================== 
export async function handleProfileStartCycle() { 
    if (typeof startWitnessCycle === 'function') { 
        await startWitnessCycle(); 
    } else { 
        showToast("Witness cycle module unavailable", "error"); 
    } 
} 

export function openEditProfile() { 
    closeProfile();
    const modal = document.getElementById('editProfileModal'); 
    if (!modal) {
        showToast("Edit Profile modal not found. Using quick bio editor instead.", "info");
        openProfile();
        setTimeout(() => toggleBioEdit(), 300);
        return;
    }

    pendingAvatarBase64 = null;

    if (currentUserData) { 
        const firstNameInput = document.getElementById('editFirstName');
        const lastNameInput = document.getElementById('editLastName');
        const displayNameInput = document.getElementById('editDisplayName'); 
        const usernameInput = document.getElementById('editUsername'); 
        const regionInput = document.getElementById('editRegion'); 
        const bioInput = document.getElementById('editBio'); 
        const hidePublicToggle = document.getElementById('toggleHidePublicInfo');
        const imgPreview = document.getElementById('avatarPreview');
        const avatarFallback = document.getElementById('avatarFallback');

        if (firstNameInput) firstNameInput.value = currentUserData.firstName || '';
        if (lastNameInput) lastNameInput.value = currentUserData.lastName || '';
        if (displayNameInput) displayNameInput.value = currentUserData.displayName || ''; 
        if (usernameInput) usernameInput.value = currentUserData.username || ''; 
        if (regionInput) regionInput.value = currentUserData.region || ''; 
        if (bioInput) bioInput.value = currentUserData.bio || ''; 
        if (hidePublicToggle) hidePublicToggle.checked = currentUserData.hidePublicInfo !== false;

        if (currentUserData.photoURL && imgPreview) {
            imgPreview.src = currentUserData.photoURL;
            imgPreview.classList.remove('hidden');
            if (avatarFallback) avatarFallback.classList.add('hidden');
        } else {
            if (imgPreview) imgPreview.classList.add('hidden');
            if (avatarFallback) avatarFallback.classList.remove('hidden');
        }
    } 
    modal.classList.remove('hidden'); 
    modal.style.display = 'flex';
    modal.style.zIndex = '10000';
} 

export function closeEditProfile() { 
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.add('hidden'); 
        modal.style.display = 'none';
    }
} 

export function openSettings() {
    closeProfile();
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        modal.style.zIndex = '10000';
    } else {
        showToast("Settings panel coming soon!", "info");
    }
}

export function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

export function handleSaveProfile(event) {
    if (event) event.preventDefault();
    saveProfileChanges();
}

export async function saveProfileChanges(event) { 
    if (event) event.preventDefault();
    if (!auth.currentUser) return showToast("You must be logged in", "error"); 

    const firstNameEl = document.getElementById('editFirstName');
    const lastNameEl = document.getElementById('editLastName');
    const displayNameEl = document.getElementById('editDisplayName');
    const usernameEl = document.getElementById('editUsername');
    const regionEl = document.getElementById('editRegion');
    const bioEl = document.getElementById('editBio');
    const hidePublicEl = document.getElementById('toggleHidePublicInfo');

    const firstName = firstNameEl?.value?.trim() || "";
    const lastName = lastNameEl?.value?.trim() || "";
    const displayName = displayNameEl?.value?.trim(); 
    const username = usernameEl?.value?.trim(); 
    const region = regionEl?.value?.trim(); 
    const bio = bioEl?.value?.trim(); 
    const hidePublicInfo = hidePublicEl ? hidePublicEl.checked : true;

    if (!displayName) return showToast("Display name is required", "error"); 

    try { 
        showToast("Saving changes...", "info"); 
        const userRef = doc(db, "users", auth.currentUser.uid); 
        
        const updatePayload = { 
            firstName,
            lastName,
            displayName, 
            username: username || null, 
            region: region || null, 
            bio: bio || null, 
            hidePublicInfo,
            updatedAt: serverTimestamp() 
        };

        if (pendingAvatarBase64) {
            updatePayload.photoURL = pendingAvatarBase64;
        }

        await updateDoc(userRef, updatePayload); 

        showToast("✅ Profile updated successfully!", "success"); 
        closeEditProfile(); 
        if (typeof refreshTierAndUI === 'function') refreshTierAndUI(); 
    } catch (error) { 
        console.error("Save profile error:", error); 
        showToast("Failed to save profile", "error"); 
    } 
} 

export async function triggerPasswordReset() {
    if (!auth.currentUser || !auth.currentUser.email) {
        return showToast("No email associated with this account", "error");
    }
    try {
        await sendPasswordResetEmail(auth, auth.currentUser.email);
        showToast("📧 Password reset email sent!", "success");
    } catch (error) {
        console.error("Password reset error:", error);
        showToast("Failed to send reset email", "error");
    }
}

export async function exportUserDataPDF() { 
    if (!currentUserData) return showToast("Profile data not loaded", "error"); 
    showToast("Generating identity PDF...", "info"); 
    
    try { 
        const jsPDF = window.jspdf?.jsPDF || window.jsPDF; 
        if (!jsPDF) throw new Error("jsPDF library not initialized"); 
        
        const pdf = new jsPDF(); 
        pdf.setFontSize(20); 
        pdf.text("VocalWitness Identity & Profile Record", 20, 20); 
        
        pdf.setFontSize(12); 
        pdf.text(`Generated: ${new Date().toLocaleString()}`, 20, 32); 
        pdf.text(`Display Name: ${currentUserData.displayName || 'N/A'}`, 20, 44); 
        pdf.text(`Username: @${currentUserData.username || 'anonymous'}`, 20, 52); 
        pdf.text(`Region: ${currentUserData.region || 'N/A'}`, 20, 60); 
        pdf.text(`Privacy Shield Active: ${currentUserData.hidePublicInfo !== false ? 'Yes' : 'No'}`, 20, 68);
        pdf.text(`Reputation: ${currentUserData.reputation || 0} REP`, 20, 76); 
        pdf.text(`Phone Verified: ${currentUserData.isPhoneVerified || currentUserData.hasVerifiedPhone ? 'Yes' : 'No'}`, 20, 84); 
        pdf.text(`ZK Verified: ${currentUserData.zkVerified ? 'Yes' : 'No'}`, 20, 92); 
        
        pdf.save(`vocalwitness-identity-${auth.currentUser?.uid || 'user'}.pdf`); 
        showToast("✅ Identity PDF Exported!", "success"); 
    } catch (e) { 
        console.error("Export error:", e); 
        showToast("PDF generation requires jsPDF", "error"); 
    } 
} 

window.addEventListener('languageChanged', () => { 
    if (currentUserData) renderProfileUI(currentUserData); 
});

// ====================== GLOBAL EXPORTS ======================
window.startPhoneVerification = function() {
    closeProfile();
    if (typeof startPhoneVerification === 'function') {
        startPhoneVerification();
    } else {
        const verifModal = document.getElementById('verificationModal') || document.getElementById('phoneVerificationModal');
        if (verifModal) {
            verifModal.classList.remove('hidden');
            verifModal.style.display = 'flex';
            verifModal.style.zIndex = '10000';
        } else {
            showToast("Verification module unavailable", "error");
        }
    }
};

window.openProfile = openProfile;
window.closeProfile = closeProfile;
window.closeProfileModal = closeProfile;
window.openProfileModal = openProfile;
window.openEditProfile = openEditProfile;
window.closeEditProfile = closeEditProfile;
window.openSettings = openSettings;
window.closeSettings = closeSettings;
window.handleSaveProfile = handleSaveProfile;
window.saveProfileChanges = saveProfileChanges;
window.handleImagePreview = handleImagePreview;
window.handleSignOut = handleSignOut;
window.handleProfileStartCycle = handleProfileStartCycle;
window.triggerPasswordReset = triggerPasswordReset;
window.exportUserDataPDF = exportUserDataPDF;
window.renderProfileUI = renderProfileUI;
window.initProfile = initProfile;

// Legacy aliases
window.openVerificationModalFromProfile = window.startPhoneVerification;
window.openSettingsModal = window.openSettings;
window.closeSettingsModal = window.closeSettings;
window.saveProfileBio = window.saveUserBio;

// Initialize
initProfile();
