// js/profile.js - Full upgraded profile (privacy default, verification ladder, sign out)
import { initProfileModals, closeProfile, closeEditProfile, closeSettings } from './modals.js';
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
import { AppState } from './app-state.js';
import { giveSupport, getRemainingSupportBudget } from './reputation.js';
import {
    getUserTierData,
    hasStewardAccess,
    refreshTierAndUI,
    getCurrentWitnessLevel
} from './tier.js';
import { renderTierBadge, showBoldWitnessModal } from './ui-components.js';
import { t } from './i18n.js';
import { showToast } from './utils.js';
import { startWitnessCycle } from './witnessCycle.js';
import { startPhoneVerification as startPhoneVerificationModule } from './verification.js';
import { generateAndDownloadPDF } from './pdf.js';

// ====================== STATE ======================
let currentUserData = null;
let userUnsubscribe = null;
let pendingAvatarBase64 = null;
window.currentUserData = null;

// ====================== HELPERS ======================
function sanitize(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function isPrivacyPrivate(userData) {
    // Default private when field is missing
    return !userData || userData.hidePublicInfo !== false;
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
    } else {
        const content = document.getElementById('profileContent') ||
                        document.getElementById('mainProfileContent') ||
                        document.getElementById('modalProfileContent');
        if (content) {
            content.innerHTML = `
                <div class="flex flex-col items-center justify-center space-y-4 py-16">
                    <div class="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
                    <p class="text-sm text-zinc-400">Loading profile...</p>
                </div>`;
        }
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
}



// ====================== INITIALIZATION ======================
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
 * Ensures user document exists in Firestore (privacy default ON)
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
                hidePublicInfo: true, // Privacy Shield ON by default
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

// ====================== RENDER PROFILE UI ======================
export function renderProfileUI(userData, retryCount = 0) {
    if (!userData) return;

    const content = document.getElementById('profileContent') ||
                    document.getElementById('mainProfileContent') ||
                    document.getElementById('modalProfileContent');

    if (!content) {
        if (retryCount < 5) {
            setTimeout(() => renderProfileUI(userData, retryCount + 1), 80);
        }
        return;
    }

    const witnessPromise = typeof getCurrentWitnessLevel === 'function'
        ? getCurrentWitnessLevel()
        : Promise.resolve(null);

    witnessPromise.then(level => {
        const isWitness = level !== null;
        const isCitizenCircle =
            userData.isPhoneVerified ||
            userData.hasVerifiedPhone ||
            userData.tier === 'citizen_circle';

        const fullName = [userData.firstName, userData.lastName].filter(Boolean).join(" ");
        const isPrivacyShieldActive = isPrivacyPrivate(userData);

        const html = `
            <div class="space-y-5 p-1 text-white">
                <!-- Profile Header -->
                <div class="flex flex-col items-center text-center">
                    <div class="relative">
                        <div class="w-24 h-24 mx-auto rounded-3xl overflow-hidden border-4 border-zinc-700 shadow-2xl bg-zinc-800">
                            ${userData.photoURL
                                ? `<img src="${sanitize(userData.photoURL)}" class="w-full h-full object-cover" alt="Profile Photo">`
                                : `<div class="w-full h-full flex items-center justify-center text-5xl">👤</div>`
                            }
                        </div>
                        ${isWitness ? `<div class="absolute -bottom-1 -right-1 text-2xl">🔐</div>` : ''}
                    </div>

                    <h2 class="text-xl font-bold mt-3 text-white">${sanitize(userData.displayName) || "Anonymous Witness"}</h2>

                    ${fullName ? `
                        <p class="text-xs font-semibold text-zinc-300 mt-0.5">
                            ${sanitize(fullName)}
                            ${isPrivacyShieldActive
                                ? '<span class="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full ml-1">🛡️ Private</span>'
                                : '<span class="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full ml-1">👁 Public</span>'
                            }
                        </p>
                    ` : `
                        <p class="text-xs mt-0.5">
                            ${isPrivacyShieldActive
                                ? '<span class="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full">🛡️ Private profile</span>'
                                : '<span class="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">👁 Public profile</span>'
                            }
                        </p>
                    `}

                    <p class="text-emerald-400 font-mono text-sm mt-1">@${sanitize(userData.username) || 'anonymous'}</p>

                    ${userData.region && !isPrivacyShieldActive
                        ? `<p class="text-xs text-zinc-400 mt-1">📍 ${sanitize(userData.region)}</p>`
                        : ''
                    }

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
                    <button type="button" id="btnStartWitnessCycle"
                            class="w-full py-2.5 bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl transition text-sm">
                        ${userData.activeWitnessCycle ? 'End Witness Cycle' : 'Start Witness Cycle'}
                    </button>
                </div>

                <!-- Bio -->
                <div class="bg-zinc-900/80 border border-zinc-700 rounded-2xl p-4">
                    <div class="flex items-center justify-between mb-2">
                        <h4 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Bio</h4>
                        <button type="button" id="btnToggleBioEdit"
                                class="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition">
                            Edit
                        </button>
                    </div>
                    <div id="bioDisplay" class="text-sm text-zinc-300 leading-relaxed min-h-[52px]">
                        ${userData.bio
                            ? sanitize(userData.bio)
                            : `<span class="text-zinc-500 italic">Tell the Square who you are... Share your story, values, or what truth means to you.</span>`
                        }
                    </div>
                    <div id="bioEditSection" class="hidden space-y-3 mt-2">
                        <textarea id="profileBioTextarea"
                                  rows="3"
                                  maxlength="280"
                                  class="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-sm text-zinc-200 focus:outline-none focus:border-emerald-500 resize-none"
                                  placeholder="Write a short bio about yourself...">${sanitize(userData.bio || '')}</textarea>
                        <div class="flex gap-2">
                            <button type="button" id="btnSaveBio"
                                    class="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-semibold rounded-xl transition">
                                Save Bio
                            </button>
                            <button type="button" id="btnCancelBioEdit"
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

                <!-- Verification Channel -->
                <div class="bg-zinc-900 rounded-2xl p-4 border border-zinc-700 space-y-3">
                    <div class="flex items-center justify-between">
                        <h4 class="font-semibold text-sm text-white flex items-center gap-2">
                            <span>🛡️</span> Verification
                        </h4>
                        <span class="text-[10px] text-zinc-500 uppercase tracking-wider">Progression</span>
                    </div>

                    <!-- Step 1: Phone -->
                    <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                        <div class="min-w-0">
                            <div class="text-sm font-medium text-zinc-200">1. Phone verification</div>
                            <div class="text-xs text-zinc-500">Citizen Circle • anti-spam • corroboration</div>
                        </div>
                        ${isCitizenCircle
                            ? `<span class="shrink-0 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">✅ Done</span>`
                            : `<button type="button" id="btnStartPhoneVerify"
                                    class="shrink-0 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-black px-3 py-1.5 rounded-xl">
                                    Verify
                               </button>`
                        }
                    </div>

                    <!-- Step 2: Higher Trust (ZK) -->
                    <div class="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-3">
                        <div class="flex items-center justify-between gap-3">
                            <div class="min-w-0">
                                <div class="text-sm font-medium text-zinc-200 flex items-center gap-1.5">
                                    2. Higher Trust Verification
                                    <span class="text-[10px] bg-teal-500/15 text-teal-400 px-1.5 py-0.5 rounded-full">Recommended</span>
                                </div>
                                <div class="text-xs text-zinc-500 mt-1 leading-relaxed">
                                    Prove your evidence is real and unchanged — without revealing who you are.
                                </div>
                            </div>
                            ${userData.zkVerified
                                ? `<span class="shrink-0 text-xs font-semibold text-teal-400 bg-teal-500/10 border border-teal-500/30 px-2.5 py-1 rounded-full">
                                     🔑 Verified
                                   </span>`
                                : `<button type="button" id="btnStartZkVerify"
                                           class="shrink-0 text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white px-3.5 py-1.5 rounded-xl transition">
                                     Start Verification
                                   </button>`
                            }
                        </div>

                        ${!userData.zkVerified ? `
                        <div class="text-[11px] text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-lg p-2.5 leading-relaxed">
                            <div class="font-medium text-zinc-300 mb-1">Quick Guide:</div>
                            <ul class="list-disc pl-4 space-y-0.5">
                                <li>Takes about 1–2 minutes</li>
                                <li>Works fully on your phone or computer</li>
                                <li>Does <strong>not</strong> reveal your real identity</li>
                                <li>Gives your future reports stronger trust weight</li>
                            </ul>
                        </div>
                        ` : ''}
                    </div>

                    <!-- Step 3: Public profile (optional) -->
                    <div class="flex items-center justify-between gap-3 p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                        <div class="min-w-0">
                            <div class="text-sm font-medium text-zinc-200">3. Public profile</div>
                            <div class="text-xs text-zinc-500">Optional. Default private. Separate from Bold Witness posting mode.</div>
                        </div>
                        <button type="button" id="btnTogglePrivacyShield"
                                class="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border transition
                                ${isPrivacyShieldActive
                                    ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/20'
                                    : 'text-amber-400 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20'}">
                            ${isPrivacyShieldActive ? '🛡️ Private' : '👁 Public'}
                        </button>
                    </div>
                </div>

                <!-- Action Buttons -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    ${!isCitizenCircle && !isWitness ? `
                        <button type="button" id="btnGetVerifiedCta"
                                class="col-span-1 sm:col-span-2 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2">
                            🛡️ Get Verified — Unlock Citizen Circle
                        </button>
                    ` : ''}

                    <button type="button" id="btnOpenEditProfile"
                            class="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-black text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2">
                        ✏️ Edit Profile
                    </button>

                    <button type="button" id="btnOpenSettings"
                            class="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2">
                        ⚙️ Settings & Security
                    </button>

                    <button type="button" id="btnSignOut"
                            class="col-span-1 sm:col-span-2 py-3 px-4 bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-400 hover:text-red-300 text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2">
                        🚪 Sign Out
                    </button>
                </div>
            </div>
        `;

        content.innerHTML = html;

        // CSP-safe wiring
        attachProfileEventListeners(userData, isCitizenCircle, isWitness);
    }).catch(err => {
        console.error("Error computing witness level:", err);
    });
}

/**
 * Attach all event listeners after the profile HTML is injected.
 * This is the CSP-safe replacement for the old onclick attributes.
 */
function attachProfileEventListeners(userData, isCitizenCircle, isWitness) {
    // Witness Cycle
    document.getElementById('btnStartWitnessCycle')?.addEventListener('click', () => {
        if (typeof handleProfileStartCycle === 'function') {
            handleProfileStartCycle();
        } else if (typeof window.handleProfileStartCycle === 'function') {
            window.handleProfileStartCycle();
        }
    });

    // Bio editing
    document.getElementById('btnToggleBioEdit')?.addEventListener('click', () => {
        if (typeof window.toggleBioEdit === 'function') window.toggleBioEdit();
    });
    document.getElementById('btnSaveBio')?.addEventListener('click', () => {
        if (typeof window.saveUserBio === 'function') window.saveUserBio();
    });
    document.getElementById('btnCancelBioEdit')?.addEventListener('click', () => {
        if (typeof window.cancelBioEdit === 'function') window.cancelBioEdit();
    });

    // Phone verification
    document.getElementById('btnStartPhoneVerify')?.addEventListener('click', () => {
        if (typeof window.startPhoneVerification === 'function') window.startPhoneVerification();
    });
    document.getElementById('btnGetVerifiedCta')?.addEventListener('click', () => {
        if (typeof window.startPhoneVerification === 'function') window.startPhoneVerification();
    });

    // ZK / Higher Trust
    document.getElementById('btnStartZkVerify')?.addEventListener('click', () => {
        window.location.href = '/verify.html?action=zk';
    });

    // Privacy Shield
    document.getElementById('btnTogglePrivacyShield')?.addEventListener('click', () => {
        if (typeof window.togglePrivacyShield === 'function') window.togglePrivacyShield();
    });

    // Edit Profile
    document.getElementById('btnOpenEditProfile')?.addEventListener('click', () => {
        if (typeof window.openEditProfileSafe === 'function') {
            window.openEditProfileSafe();
        } else if (typeof openEditProfile === 'function') {
            openEditProfile();
        }
    });

    // Support / Give Reputation Button
    document.getElementById('supportBtn')?.addEventListener('click', async () => {
        const targetUserId = window.currentProfileUserId || userData?.uid;
        const strength = 3; 

        if (targetUserId && typeof giveSupport === 'function') {
            const success = await giveSupport(targetUserId, strength);
            if (success) {
                // Optionally refresh reputation display
            }
        }
    });

    // Dark Mode Toggle
    document.getElementById('theme-toggle-btn')?.addEventListener('click', () => {
        if (typeof window.toggleDarkMode === 'function') {
            window.toggleDarkMode();
        }
    });

    // Settings
    document.getElementById('btnOpenSettings')?.addEventListener('click', () => {
        if (typeof window.openSettingsSafe === 'function') {
            window.openSettingsSafe();
        } else if (typeof openSettings === 'function') {
            openSettings();
        }
    });

    // Sign Out
    document.getElementById('btnSignOut')?.addEventListener('click', () => {
        if (typeof handleSignOut === 'function') {
            handleSignOut();
        } else if (typeof window.handleSignOut === 'function') {
            window.handleSignOut();
        }
    });
}

// ====================== BIO EDIT HELPERS ======================
window.toggleBioEdit = function () {
    const display = document.getElementById('bioDisplay');
    const edit = document.getElementById('bioEditSection');
    if (display && edit) {
        display.classList.add('hidden');
        edit.classList.remove('hidden');
        document.getElementById('profileBioTextarea')?.focus();
    }
};

window.cancelBioEdit = function () {
    const display = document.getElementById('bioDisplay');
    const edit = document.getElementById('bioEditSection');
    if (display && edit) {
        display.classList.remove('hidden');
        edit.classList.add('hidden');
    }
};

window.saveUserBio = async function () {
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

// ====================== PRIVACY SHIELD TOGGLE ======================
window.togglePrivacyShield = async function () {
    if (!auth.currentUser) {
        showToast("You must be signed in", "error");
        return;
    }
    const currentlyPrivate = isPrivacyPrivate(currentUserData);
    const nextPrivate = !currentlyPrivate;
    try {
        showToast(nextPrivate ? "Switching to private…" : "Making profile public…", "info");
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            hidePublicInfo: nextPrivate,
            updatedAt: serverTimestamp()
        });
        if (currentUserData) {
            currentUserData.hidePublicInfo = nextPrivate;
            window.currentUserData = currentUserData;
        }
        showToast(
            nextPrivate
                ? "🛡️ Profile is private (name & location hidden from others)"
                : "👁 Profile is public (display info can appear on the Square)",
            "success"
        );
    } catch (err) {
        console.error("Privacy toggle failed:", err);
        showToast("Could not update privacy setting", "error");
    }
};

// ====================== SAFE MODAL OPENERS ======================
window.openEditProfileSafe = function () {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        openEditProfile();
        return;
    }
    showToast("Opening quick bio editor...", "info");
    toggleBioEdit();
};

window.openSettingsSafe = function () {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        openSettings();
        return;
    }
    showToast("Settings & Security panel is being improved. Coming soon!", "info");
};

// ====================== IMAGE UPLOAD + COMPRESSION ======================
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
          window.location.href = window.location.origin + '/' || '/';
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
    const modal = document.getElementById('editProfileModal');
    if (!modal) {
        showToast("Edit Profile modal not found. Using quick bio editor instead.", "info");
        openProfile();
        setTimeout(() => {
            if (typeof toggleBioEdit === 'function') toggleBioEdit();
        }, 300);
        return;
    }
    pendingAvatarBase64 = null;
    if (currentUserData) {
        const firstNameInput   = document.getElementById('editFirstName');
        const lastNameInput    = document.getElementById('editLastName');
        const displayNameInput = document.getElementById('editDisplayName');
        const usernameInput    = document.getElementById('editUsername');
        const regionInput      = document.getElementById('editRegion');
        const bioInput         = document.getElementById('editBio');
        const hidePublicToggle = document.getElementById('toggleHidePublicInfo');
        const imgPreview       = document.getElementById('avatarPreview');
        const avatarFallback   = document.getElementById('avatarFallback');
        if (firstNameInput)   firstNameInput.value   = currentUserData.firstName || '';
        if (lastNameInput)    lastNameInput.value    = currentUserData.lastName || '';
        if (displayNameInput) displayNameInput.value = currentUserData.displayName || '';
        if (usernameInput)    usernameInput.value    = currentUserData.username || '';
        if (regionInput)      regionInput.value      = currentUserData.region || '';
        if (bioInput)         bioInput.value         = currentUserData.bio || '';
        if (hidePublicToggle) hidePublicToggle.checked = isPrivacyPrivate(currentUserData);
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
    modal.classList.add('flex');
    modal.setAttribute('aria-hidden', 'false');
    closeProfile();
}

export function closeEditProfile() {
    const modal = document.getElementById('editProfileModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.setAttribute('aria-hidden', 'true');
    }
}

export function openSettings() {
    closeProfile();
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        modal.style.zIndex = '10000';
        modal.setAttribute('aria-hidden', 'false');
    } else {
        showToast("Settings panel coming soon!", "info");
    }
}

export function closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
        modal.setAttribute('aria-hidden', 'true');
    }
}

export function handleSaveProfile(event) {
    if (event) event.preventDefault();
    saveProfileChanges();
}

export async function saveProfileChanges(event) {
    if (event) event.preventDefault();
    if (!auth.currentUser) return showToast("You must be logged in", "error");

    const firstNameEl   = document.getElementById('editFirstName');
    const lastNameEl    = document.getElementById('editLastName');
    const displayNameEl = document.getElementById('editDisplayName');
    const usernameEl    = document.getElementById('editUsername');
    const regionEl      = document.getElementById('editRegion');
    const bioEl         = document.getElementById('editBio');
    const hidePublicEl  = document.getElementById('toggleHidePublicInfo');

    const firstName     = firstNameEl?.value?.trim() || "";
    const lastName      = lastNameEl?.value?.trim() || "";
    const displayName   = displayNameEl?.value?.trim();
    const username      = usernameEl?.value?.trim();
    const region        = regionEl?.value?.trim();
    const bio           = bioEl?.value?.trim();
    const hidePublicInfo = hidePublicEl ? hidePublicEl.checked : true;
    
    if (!displayNameEl) {
        showToast("Edit form not ready", "error");
        return;
    }

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
        showToast("Failed to send password reset email", "error");
    }
}

// ====================== LANGUAGE CHANGE SUPPORT ======================
window.addEventListener('languageChanged', () => {
    if (currentUserData) renderProfileUI(currentUserData);
});

// ====================== GLOBAL EXPORTS & LEGACY ALIASES ======================
window.startPhoneVerification = function () {
    closeProfile();
    if (typeof startPhoneVerificationModule === 'function') {
        startPhoneVerificationModule();
    } else {
        const verifModal = document.getElementById('verificationModal') || document.getElementById('phoneVerificationModal');
        if (verifModal) {
            verifModal.classList.remove('hidden');
            verifModal.classList.add('flex');
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
window.renderProfileUI = renderProfileUI;
window.initProfile = initProfile;

// Legacy aliases
window.openVerificationModalFromProfile = window.startPhoneVerification;
window.openSettingsModal = window.openSettings;
window.closeSettingsModal = window.closeSettings;
window.saveProfileBio = window.saveUserBio;

// ====================== PROFILE MANAGER (Card / Dual-Identity View) ======================
export class ProfileManager {
    constructor() {
        this.profileContainer = document.getElementById('profileCard');
        this.modeToggleBtn = document.getElementById('identityModeToggleBtn');
    }

    async init() {
        if (!auth.currentUser) {
            this.renderLoggedOutState();
            return;
        }
        const user = auth.currentUser;
        const tierData = await getUserTierData(user.uid);
        const currentMode = AppState.getIdentityMode();
        this.renderProfileCard(user, tierData, currentMode);
        this.bindEvents(user, tierData);
    }

    renderProfileCard(user, tierData, mode) {
        if (!this.profileContainer) return;
        const isBold = mode === 'BOLD_WITNESS';
        const displayName = isBold
            ? (user.displayName || 'Verified Witness')
            : `Witness #${user.uid.slice(0, 6)}`;
        const avatarUrl = isBold
            ? (user.photoURL || 'assets/default-avatar.png')
            : 'assets/zk-shield-avatar.png';
        const identityBadge = isBold
            ? `<span class="bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs px-2.5 py-1 rounded-full font-mono">⚡ Bold Witness</span>`
            : `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-1 rounded-full font-mono">🛡️ ZK-Anonymous</span>`;

        this.profileContainer.innerHTML = `
            <div class="bg-zinc-950 border border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-6">
                <div class="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                    <img src="${avatarUrl}" alt="Avatar" class="w-20 h-20 rounded-full border-2 border-zinc-700 object-cover" />
                    <div class="space-y-1">
                        <div class="flex items-center justify-center sm:justify-start gap-2">
                            <h2 class="text-xl font-bold text-white">${displayName}</h2>
                            ${renderTierBadge(tierData?.tier || 'citizen')}
                        </div>
                        <p class="text-xs text-zinc-400 font-mono">${user.email || 'Phone Verified'}</p>
                        <div class="pt-1">${identityBadge}</div>
                    </div>
                </div>
                <hr class="border-zinc-800" />
                <div class="bg-zinc-900/60 border border-zinc-800 rounded-2xl p-4 flex items-center justify-between">
                    <div>
                        <h4 class="text-sm font-semibold text-zinc-200">Active Identity Mode</h4>
                        <p class="text-xs text-zinc-400 mt-0.5">
                            ${isBold
                                ? 'Metadata preserved for legal validity.'
                                : 'EXIF & IP stripped via zero-knowledge layer.'
                            }
                        </p>
                    </div>
                    <button id="switchModeBtn" type="button"
                            class="bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-4 py-2 rounded-xl text-xs font-semibold transition border border-zinc-700">
                        ${isBold ? 'Switch to Anonymous' : 'Enable Bold Witness'}
                    </button>
                </div>
                <div class="space-y-3">
                    <h4 class="text-xs font-mono uppercase tracking-wider text-zinc-500">Forensic Pipeline Defaults</h4>
                    <div class="space-y-2">
                        <label class="flex items-center justify-between p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/60 cursor-pointer">
                            <span class="text-xs text-zinc-300">Auto-Pitch Shift Audio Recordings</span>
                            <input type="checkbox" id="prefVoiceObfuscation"
                                   ${AppState.getPref('voiceObfuscate') ? 'checked' : ''}
                                   class="rounded bg-zinc-800 border-zinc-700 text-emerald-500">
                        </label>
                        <label class="flex items-center justify-between p-3 bg-zinc-900/40 rounded-xl border border-zinc-800/60 cursor-pointer">
                            <span class="text-xs text-zinc-300">Strip Image EXIF & Location Data</span>
                            <input type="checkbox" id="prefExifScrub"
                                   ${AppState.getPref('exifScrub') ? 'checked' : ''}
                                   class="rounded bg-zinc-800 border-zinc-700 text-emerald-500">
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    bindEvents(user, tierData) {
        const switchBtn = document.getElementById('switchModeBtn');
        if (switchBtn) {
            switchBtn.addEventListener('click', () => {
                const currentMode = AppState.getIdentityMode();
                if (currentMode === 'ANONYMOUS') {
                    showBoldWitnessModal(async () => {
                        AppState.setIdentityMode('BOLD_WITNESS');
                        this.init();
                        showToast("Bold Witness Mode Activated", "info");
                    });
                } else {
                    AppState.setIdentityMode('ANONYMOUS');
                    this.init();
                    showToast("Switched to ZK-Anonymous Mode", "success");
                }
            });
        }
        const voiceToggle = document.getElementById('prefVoiceObfuscation');
        if (voiceToggle) {
            voiceToggle.addEventListener('change', (e) => {
                AppState.setPref('voiceObfuscate', e.target.checked);
            });
        }
        const exifToggle = document.getElementById('prefExifScrub');
        if (exifToggle) {
            exifToggle.addEventListener('change', (e) => {
                AppState.setPref('exifScrub', e.target.checked);
            });
        }
    }

    renderLoggedOutState() {
        if (!this.profileContainer) return;
        this.profileContainer.innerHTML = `
            <div class="text-center py-12 text-zinc-500">
                <p class="text-sm">Please connect or verify your account to view profile settings.</p>
            </div>
        `;
    }
}

// ====================== AUTO-INIT ======================
initProfile();

document.addEventListener('DOMContentLoaded', () => {
    const manager = new ProfileManager();
    if (manager.profileContainer) {
        manager.init();
    }
});

// ====================== CLOSE / ESCAPE LISTENERS ======================
document.addEventListener('DOMContentLoaded', () => {
    // ProfileManager
    const manager = new ProfileManager();
    if (manager.profileContainer) {
        manager.init();
    }

    // Modal wiring
    initProfileModals();

    // Default page select
    document.getElementById('defaultDoorSelect')?.addEventListener('change', (e) => {
        localStorage.setItem('vw_default_page', e.target.value);
        if (typeof showToast === 'function') {
            showToast("Default page saved", "success");
        }
    });

    // Close / Escape listeners
    document.getElementById('closeProfileModalBtn')?.addEventListener('click', closeProfile);
    document.getElementById('closeEditProfileBtn')?.addEventListener('click', closeEditProfile);
    document.getElementById('btn-close-edit-profile')?.addEventListener('click', closeEditProfile);

    document.getElementById('profileModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'profileModal') closeProfile();
    });

    document.getElementById('editProfileModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'editProfileModal') closeEditProfile();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (typeof closeProfile === 'function') closeProfile();
            if (typeof closeEditProfile === 'function') closeEditProfile();
            if (typeof closeSettings === 'function') closeSettings();
        }
    });
});
