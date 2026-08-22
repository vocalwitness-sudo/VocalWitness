// js/profile.js - Integrated, Refactored & Fully Localized Version
// Updated: Fixed Form Submission Handlers, ZK Proof Badge & Complete Modal Suite

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
window.currentUserData = null; 

// Expose startPhoneVerification globally for inline HTML handlers
window.startPhoneVerification = function() {
    if (typeof startPhoneVerification === 'function') {
        startPhoneVerification();
    } else {
        console.error("Phone verification module not available.");
        showToast(t("profile.verification_unavailable", "Verification module unavailable"), "error");
    }
};

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

    // Remove every possible "closed" state
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.style.display = 'flex';
    modal.style.visibility = 'visible';
    modal.style.opacity = '1';
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

// Expose globally (and keep aliases)
window.openProfile = openProfile;
window.closeProfile = closeProfile;
window.closeProfileModal = closeProfile;
window.openProfileModal = openProfile;
// Expose globally so main.js data-action="open-profile" works
window.openProfile = openProfile;
window.closeProfile = closeProfile;
window.closeProfileModal = closeProfile;   // alias for older HTML
window.openProfileModal = openProfile;     // alias for older HTML


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
window.initProfile = initProfile;

/**
 * Creates a default user document in Firestore if it doesn't exist yet
 */
async function ensureUserProfile(user) {
    try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        
        if (!snap.exists()) {
            console.log("New user detected. Provisioning zero-knowledge profile in Firestore...");
            await setDoc(userRef, {
                email: user.email || "",
                displayName: user.displayName || "",
                photoURL: user.photoURL || "",
                username: user.email ? user.email.split('@')[0] : `user_${user.uid.substring(0, 6)}`,
                reputation: 0,
                testimoniesCount: 0,
                verifications: 0,
                isPhoneVerified: false,
                hasVerifiedPhone: false,
                zkVerified: false,
                activeWitnessCycle: false,
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
         
        const formattedDate = (userData.createdAt && typeof userData.createdAt.toDate === 'function') 
            ? new Date(userData.createdAt.toDate()).toLocaleDateString() 
            : t("common.recent", "Recent"); 

        const html = ` 
            <div class="space-y-6 p-4 text-white"> 
                <!-- Red Zone / Client-Side Isolation Banner -->
                <div class="bg-red-950/40 border border-red-500/50 rounded-2xl p-4 flex items-start gap-3 shadow-lg shadow-red-950/20">
                    <span class="text-2xl">🛑</span>
                    <div>
                        <h5 class="text-sm font-bold text-red-400 flex items-center gap-2">
                            ${t("profile.red_zone_title", "RESTRICTED ZONE — Client-Side Isolation")}
                        </h5>
                        <p class="text-xs text-red-200/80 mt-1 leading-relaxed">
                            ${t("profile.red_zone_desc", "This identity profile is sealed on your device. Third-party AI models and public scrapers are strictly prohibited from accessing, reading, or training on this data.")}
                        </p>
                    </div>
                </div>

                <!-- Profile Header --> 
                <div class="flex flex-col items-center text-center"> 
                    <div class="relative"> 
                        <div class="w-28 h-28 mx-auto rounded-3xl overflow-hidden border-4 border-zinc-700 shadow-2xl"> 
                            ${userData.photoURL ?  
                                `<img src="${sanitize(userData.photoURL)}" class="w-full h-full object-cover" alt="Profile Photo">` :  
                                `<div class="w-full h-full bg-gradient-to-br from-zinc-700 to-zinc-800 flex items-center justify-center text-6xl">👤</div>` 
                            } 
                        </div> 
                        ${isWitness ? `<div class="absolute -bottom-1 -right-1 text-3xl" title="${t("profile.active_witness", "Active Witness")}">🔐</div>` : ''} 
                    </div> 
                     
                    <h2 class="text-2xl font-bold mt-4 text-white">${sanitize(userData.displayName) || t("profile.anonymous_witness", "Anonymous Witness")}</h2> 
                    <p class="text-emerald-400 font-mono text-sm">@${sanitize(userData.username) || 'anonymous'}</p> 
                    ${userData.region ? `<p class="text-xs text-zinc-400 mt-1">📍 ${sanitize(userData.region)}</p>` : ''} 
                     
                    <!-- Tier & ZK Verification Badges --> 
                    <div class="mt-4 flex flex-wrap justify-center gap-2"> 
                        ${level ? ` 
                            <div class="inline-flex items-center gap-3 px-5 py-2.5 bg-zinc-900 border border-zinc-700 rounded-3xl"> 
                                <span class="text-3xl">${level.emblem}</span> 
                                <div class="text-left"> 
                                    <div class="font-bold text-sm text-white">${sanitize(level.name)}</div> 
                                    <div class="text-xs text-zinc-400">${t("profile.level", "Level")} ${level.level} • ${userData.reputation || 0} REP</div> 
                                </div> 
                            </div> 
                        ` : isCitizenCircle ? `
                            <div class="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-3xl">
                                <span class="text-2xl">🛡️</span>
                                <div class="text-left">
                                    <div class="font-bold text-sm text-emerald-400">Citizen Circle</div>
                                    <div class="text-xs text-zinc-400">Phone Verified • ${userData.reputation || 60} REP</div>
                                </div>
                            </div>
                        ` : ` 
                            <div class="px-5 py-2.5 bg-zinc-800 rounded-3xl text-xs text-zinc-300">
                                👤 ${t("profile.citizen", "Citizen")} (Unverified)
                            </div> 
                        `} 

                        ${userData.zkVerified ? `
                            <div class="inline-flex items-center gap-1.5 px-3 py-2.5 bg-teal-500/10 border border-teal-500/30 rounded-3xl text-xs text-teal-400 font-medium">
                                <span>🔑</span> ZK-Proof Attested
                            </div>
                        ` : ''}
                    </div> 
                </div> 

                <!-- Witness Cycle Control Card --> 
                <div class="bg-zinc-900 rounded-3xl p-5 border border-amber-500/20"> 
                    <div class="flex justify-between items-start mb-3"> 
                        <div> 
                            <h4 class="font-semibold text-base text-amber-400 flex items-center gap-2"> 
                                <span>🔄</span> ${t("profile.witness_cycle", "Witness Cycle")} 
                            </h4> 
                            <p class="text-xs text-zinc-400 mt-0.5">${t("profile.witness_cycle_desc", "Manage active attestation status in the public square.")}</p> 
                        </div> 
                        <span class="px-2.5 py-1 bg-amber-500/10 text-amber-400 text-xs font-mono rounded-full border border-amber-500/30"> 
                            ${userData.activeWitnessCycle ? t("common.active", "Active") : t("common.inactive", "Inactive")} 
                        </span> 
                    </div> 
                    <button onclick="handleProfileStartCycle()"  
                            class="w-full py-3 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/10 text-sm"> 
                        <span>🔄</span> ${userData.activeWitnessCycle ? t("profile.end_cycle", "End Witness Cycle") : t("profile.start_cycle", "Start Witness Cycle")} 
                    </button> 
                </div> 

                <!-- Bio --> 
                ${userData.bio ? ` 
                    <div class="bg-zinc-900/70 border border-zinc-700 rounded-2xl p-4 text-xs text-zinc-300 leading-relaxed"> 
                        ${sanitize(userData.bio)} 
                    </div> 
                ` : ''} 

                <!-- Stats --> 
                <div class="grid grid-cols-3 gap-3"> 
                    <div class="bg-zinc-900 rounded-2xl p-4 text-center"> 
                        <div class="text-2xl font-bold text-emerald-400">${userData.reputation || 0}</div> 
                        <div class="text-xs text-zinc-500 mt-1">${t("profile.reputation", "Reputation")}</div> 
                    </div> 
                    <div class="bg-zinc-900 rounded-2xl p-4 text-center"> 
                        <div class="text-2xl font-bold text-white">${userData.testimoniesCount || 0}</div> 
                        <div class="text-xs text-zinc-500 mt-1">${t("profile.testimonies", "Testimonies")}</div> 
                    </div> 
                    <div class="bg-zinc-900 rounded-2xl p-4 text-center"> 
                        <div class="text-2xl font-bold text-amber-400">${userData.verifications || 0}</div> 
                        <div class="text-xs text-zinc-500 mt-1">${t("profile.verifications", "Verifications")}</div> 
                    </div> 
                </div> 

                <!-- Action Controls: Responsive Grid --> 
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-6"> 
                    ${!isCitizenCircle && !isWitness ? `
                        <button onclick="startPhoneVerification()"
                                class="col-span-1 sm:col-span-2 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-900/30">
                            🛡️ Get Verified — Unlock Citizen Circle
                        </button>
                    ` : ''}

                    <button onclick="openEditProfile()"  
                            class="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2"> 
                        ✏️ ${t("profile.edit_profile", "Edit Profile")} 
                    </button> 

                    <button onclick="openSettings()"  
                            class="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2"> 
                        ⚙️ ${t("profile.settings", "Settings & Security")} 
                    </button> 

                    <button onclick="handleSignOut()"  
                            class="col-span-1 sm:col-span-2 py-3 px-4 bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-400 hover:text-red-300 text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2"> 
                        🚪 ${t("auth.sign_out", "Sign Out")} 
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
window.renderProfileUI = renderProfileUI;

// ====================== SIGN OUT HANDLER ====================== 
export async function handleSignOut() { 
    try { 
        showToast(t("auth.signing_out", "Signing out..."), "info"); 
        
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
        showToast(t("auth.sign_out_error", "Error signing out"), "error"); 
    } 
} 
window.handleSignOut = handleSignOut;

// ====================== MODAL & OTHER CONTROLS ====================== 
export async function handleProfileStartCycle() { 
    if (typeof startWitnessCycle === 'function') { 
        await startWitnessCycle(); 
    } else { 
        showToast(t("profile.cycle_module_unavailable", "Witness cycle module unavailable"), "error"); 
    } 
} 
window.handleProfileStartCycle = handleProfileStartCycle;

export function openEditProfile() { 
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
    modal.style.display = 'flex';
} 
window.openEditProfile = openEditProfile;

export function closeEditProfile() { 
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.add('hidden'); 
        modal.style.display = 'none';
    }
} 
window.closeEditProfile = closeEditProfile;

export function openSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}
window.openSettings = openSettings;

export function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}
window.closeSettings = closeSettings;

export function handleSaveProfile(event) {
    if (event) event.preventDefault();
    saveProfileChanges();
}
window.handleSaveProfile = handleSaveProfile;

export async function saveProfileChanges() { 
    if (!auth.currentUser) return showToast(t("auth.must_be_logged_in", "You must be logged in"), "error"); 

    const displayNameEl = document.getElementById('editDisplayName');
    const usernameEl = document.getElementById('editUsername');
    const regionEl = document.getElementById('editRegion');
    const bioEl = document.getElementById('editBio');

    const displayName = displayNameEl?.value?.trim(); 
    const username = usernameEl?.value?.trim(); 
    const region = regionEl?.value?.trim(); 
    const bio = bioEl?.value?.trim(); 

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
        closeEditProfile(); 
        if (typeof refreshTierAndUI === 'function') refreshTierAndUI(); 
    } catch (error) { 
        console.error("Save profile error:", error); 
        showToast(t("profile.failed_to_save", "Failed to save profile"), "error"); 
    } 
} 
window.saveProfileChanges = saveProfileChanges;

export async function triggerPasswordReset() {
    if (!auth.currentUser || !auth.currentUser.email) {
        return showToast(t("auth.email_not_found", "No email associated with active session"), "error");
    }
    try {
        await sendPasswordResetEmail(auth, auth.currentUser.email);
        showToast("📧 " + t("auth.reset_email_sent", "Password reset email sent!"), "success");
    } catch (error) {
        console.error("Password reset error:", error);
        showToast(t("auth.reset_failed", "Failed to send reset email"), "error");
    }
}
window.triggerPasswordReset = triggerPasswordReset;

export async function exportUserDataPDF() { 
    if (!currentUserData) return showToast(t("profile.data_not_loaded", "Profile data not loaded"), "error"); 
    showToast(t("profile.generating_pdf", "Generating identity PDF..."), "info"); 
    
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
        pdf.text(`Reputation: ${currentUserData.reputation || 0} REP`, 20, 68); 
        pdf.text(`Phone Verified: ${currentUserData.isPhoneVerified || currentUserData.hasVerifiedPhone ? 'Yes' : 'No'}`, 20, 76); 
        pdf.text(`ZK Verified: ${currentUserData.zkVerified ? 'Yes' : 'No'}`, 20, 84); 
        
        pdf.save(`vocalwitness-identity-${auth.currentUser?.uid || 'user'}.pdf`); 
        showToast("✅ " + t("profile.pdf_exported", "Identity PDF Exported!"), "success"); 
    } catch (e) { 
        console.error("Export error:", e); 
        showToast(t("profile.jspdf_required", "PDF generation requires jsPDF script inclusion"), "error"); 
    } 
} 
window.exportUserDataPDF = exportUserDataPDF;

window.addEventListener('languageChanged', () => { 
    if (currentUserData) renderProfileUI(currentUserData); 
});

// Initialize Profile Listener Hook
initProfile();
