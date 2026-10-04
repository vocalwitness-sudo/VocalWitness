// js/profile.js - Full upgraded profile (privacy default, verification ladder, sign out)
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
import { enrollTotpMfa, finalizeTotpEnrollment, getEnrolledFactors, unenrollMfa } from "./mfa.js";
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
import './zk-elevation.js';

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
    return !userData || userData.hidePublicInfo !== false;
}

async function syncPublicProfile(uid, userData) {
    if (!uid || !userData) return;
    try {
        const publicRef = doc(db, "publicProfiles", uid);
        const isPrivate = userData.hidePublicInfo !== false;
        const publicData = {
            uid,
            displayName: userData.displayName || "Anonymous Witness",
            photoURL: userData.photoURL || null,
            username: userData.username || null,
            bio: isPrivate ? null : (userData.bio || null),
            region: isPrivate ? null : (userData.region || null),
            tierBadge: (userData.tier === "citizen_circle" || userData.isPhoneVerified || userData.hasVerifiedPhone)
                ? "citizen_circle"
                : "citizen",
            updatedAt: serverTimestamp()
        };
        await setDoc(publicRef, publicData, { merge: true });
    } catch (err) {
        console.warn("[profile] syncPublicProfile failed:", err);
    }
}

// ====================== OPEN / CLOSE MAIN PROFILE MODAL ======================
export function openProfile() {
    const modal = document.getElementById('profileModal');
    if (!modal) {
        showToast(t("profile.modal_not_found", "Profile modal not found"), "error");
        return;
    }
    modal.style.display = '';
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
window.openProfile = openProfile;

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

async function ensureUserProfile(user) {
    try {
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (!snap.exists()) {
            console.log("New user detected. Provisioning profile...");
            await setDoc(userRef, {
                uid: user.uid,
                email: user.email || "",
                displayName: user.displayName || "Anonymous Witness",
                firstName: "",
                lastName: "",
                photoURL: user.photoURL || "",
                username: user.email
                    ? user.email.split("@")[0]
                    : `user_${user.uid.substring(0, 6)}`,
                region: "",
                bio: "",
                hidePublicInfo: true,
                tier: "citizen",
                activeWitnessCycle: false,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
        }
        listenToUserProfile(user.uid);
    } catch (error) {
        console.error("Error provisioning user profile:", error);
        showToast(t("profile.error_loading", "Error initializing profile"), "error");
        try {
            listenToUserProfile(user.uid);
        } catch (_) {
            renderProfileError(error);
        }
    }
}

function listenToUserProfile(userId) {
    if (userUnsubscribe) userUnsubscribe();
    const userRef = doc(db, "users", userId);
    userUnsubscribe = onSnapshot(
        userRef,
        (snapshot) => {
            if (snapshot.exists()) {
                currentUserData = snapshot.data();
                window.currentUserData = currentUserData;
                renderProfileUI(currentUserData);
                if (typeof refreshTierAndUI === "function") refreshTierAndUI();
            } else {
                renderProfileError(new Error("Profile document not found"));
            }
        },
        (error) => {
            console.error("Profile Firestore Error:", error);
            renderProfileError(error);
        }
    );
}

function renderProfileError(err) {
    const content =
        document.getElementById("mainProfileContent") ||
        document.getElementById("profileContent") ||
        document.getElementById("modalProfileContent");
    if (!content) return;
    const msg =
        err?.code === "permission-denied"
            ? "Permission denied while creating/reading your profile. Check Firestore rules."
            : (err?.message || "Unknown error");
    content.innerHTML = `
        <div class="flex flex-col items-center justify-center py-20 space-y-4 text-center px-6">
            <div class="text-4xl">⚠️</div>
            <h2 class="text-lg font-bold text-white">Could not load profile</h2>
            <p class="text-sm text-zinc-400 max-w-sm">${sanitize(msg)}</p>
            <button type="button" onclick="location.reload()"
                    class="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl cursor-pointer">
                Retry
            </button>
        </div>
    `;
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
                            ${sanitize(fullName)}${isPrivacyShieldActive
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
                        ${userData.zkVerified ? (() => {
                            const isFallback = userData.lastZkIsFallback === true;
                            const type = (userData.lastZkProofType || '').toUpperCase();
                            const isRealSNARK = !isFallback && (type.includes('SNARK') || type.includes('GROTH16'));
                            if (isRealSNARK) {
                                return `<div class="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl text-xs text-emerald-400 font-medium">
                                            <span>⚖️</span> ZK-SNARK Seal
                                        </div>`;
                            }
                            return `<div class="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-500/10 border border-slate-500/30 rounded-2xl text-xs text-slate-300 font-medium">
                                        <span>🔏</span> Integrity Seal
                                    </div>`;
                        })() : ''}
                    </div>
                </div>

                <!-- Witness Cycle -->
                <div class="flex items-center justify-between gap-3 bg-zinc-900/80 rounded-xl px-4 py-3 border border-amber-500/20">
                    <div class="min-w-0">
                        <div class="text-sm font-medium text-amber-400 flex items-center gap-1.5">
                            <span>🔄</span> Witness Cycle
                        </div>
                        <div class="text-[11px] text-zinc-500 truncate">
                            ${userData.activeWitnessCycle ? 'Active attestation cycle' : 'Tap to join attestation cycle'}
                        </div>
                    </div>
                    <button type="button" id="btnStartWitnessCycle"
                            class="shrink-0 px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold rounded-lg transition">
                        ${userData.activeWitnessCycle ? 'End' : 'Start'}
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
                                ? (() => {
                                    const isFallback = userData.lastZkIsFallback === true;
                                    const type = (userData.lastZkProofType || '').toUpperCase();
                                    const isRealSNARK = !isFallback && (type.includes('SNARK') || type.includes('GROTH16'));
                                    return isRealSNARK
                                        ? `<span class="shrink-0 text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full">⚖️ ZK-SNARK</span>`
                                        : `<span class="shrink-0 text-xs font-semibold text-slate-300 bg-slate-500/10 border border-slate-500/30 px-2.5 py-1 rounded-full">🔏 Integrity Seal</span>`;
                                })()
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

                    <!-- Step 3: Public profile -->
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

                    <!-- Single clean PDF Credential button -->
                    <button type="button" id="exportUserDataPdfBtn"
                            class="col-span-1 sm:col-span-2 py-3.5 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2">
                        📥 Download Press Credential
                    </button>

                    <button type="button" id="downloadProfileJsonBtn"
                            class="py-3 px-4 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2">
                        📄 Profile JSON
                    </button>

                    <button type="button" id="btnSignOut"
                            class="col-span-1 sm:col-span-2 py-3 px-4 bg-red-950/40 hover:bg-red-900/60 border border-red-500/40 text-red-400 hover:text-red-300 text-xs font-semibold rounded-2xl transition flex items-center justify-center gap-2">
                        🚪 Sign Out
                    </button>
                </div>
            </div>
        `;

        content.innerHTML = html;
        attachProfileEventListeners(userData, isCitizenCircle, isWitness);
    }).catch(err => {
        console.error("renderProfileUI failed:", err);
        content.innerHTML = `
            <div class="flex flex-col items-center justify-center py-16 space-y-4 text-center text-white">
                <div class="w-20 h-20 rounded-3xl bg-zinc-800 flex items-center justify-center text-4xl">👤</div>
                <h2 class="text-xl font-bold text-white">${sanitize(userData.displayName) || "Anonymous Witness"}</h2>
                <p class="text-sm text-zinc-400">Profile loaded (witness level temporarily unavailable)</p>
            </div>
        `;
    });
}

/**
 * Attach all event listeners after the profile HTML is injected (CSP-safe)
 */
function attachProfileEventListeners(userData, isCitizenCircle, isWitness) {
    document.getElementById('btnStartWitnessCycle')?.addEventListener('click', () => {
        if (typeof handleProfileStartCycle === 'function') {
            handleProfileStartCycle();
        } else if (typeof window.handleProfileStartCycle === 'function') {
            window.handleProfileStartCycle();
        }
    });

    document.getElementById('btnToggleBioEdit')?.addEventListener('click', () => {
        if (typeof window.toggleBioEdit === 'function') window.toggleBioEdit();
    });
    document.getElementById('btnSaveBio')?.addEventListener('click', () => {
        if (typeof window.saveUserBio === 'function') window.saveUserBio();
    });
    document.getElementById('btnCancelBioEdit')?.addEventListener('click', () => {
        if (typeof window.cancelBioEdit === 'function') window.cancelBioEdit();
    });

    document.getElementById('btnStartPhoneVerify')?.addEventListener('click', () => {
        if (typeof window.startPhoneVerification === 'function') window.startPhoneVerification();
    });
    document.getElementById('btnGetVerifiedCta')?.addEventListener('click', () => {
        if (typeof window.startPhoneVerification === 'function') window.startPhoneVerification();
    });
    document.getElementById('btnStartZkVerify')?.addEventListener('click', () => {
        if (typeof window.startZKVerification === 'function') {
            window.startZKVerification();
        } else {
            window.location.href = '/verify.html?action=zk';
        }
    });
    document.getElementById('btnTogglePrivacyShield')?.addEventListener('click', () => {
        if (typeof window.togglePrivacyShield === 'function') window.togglePrivacyShield();
    });

    document.getElementById('btnOpenEditProfile')?.addEventListener('click', () => {
        if (typeof window.openEditProfileSafe === 'function') {
            window.openEditProfileSafe();
        } else if (typeof openEditProfile === 'function') {
            openEditProfile();
        }
    });

    document.getElementById('btnOpenSettings')?.addEventListener('click', () => {
        if (typeof window.openSettingsSafe === 'function') {
            window.openSettingsSafe();
        } else if (typeof openSettings === 'function') {
            openSettings();
        }
    });

    document.getElementById('btnSignOut')?.addEventListener('click', () => {
        if (typeof handleSignOut === 'function') {
            handleSignOut();
        } else if (typeof window.handleSignOut === 'function') {
            window.handleSignOut();
        }
    });

  // ===== Download Press Credential (Proper Choice Modal) =====
document.getElementById('exportUserDataPdfBtn')?.addEventListener('click', () => {
    const data = window.currentUserData || userData;
    if (!data) {
        showToast('Profile data not loaded', 'error');
        return;
    }

    const modal = document.getElementById('credentialChoiceModal');
    if (!modal) {
        showToast('Credential choice modal not found', 'error');
        return;
    }

    // Show the modal
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    // Clean previous listeners (important)
    const btnPremium = document.getElementById('btnChoosePremium');
    const btnStandard = document.getElementById('btnChooseStandard');
    const btnCancel = document.getElementById('btnCancelCredential');

    const closeModal = () => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    };

    // Remove old listeners by cloning
    const newPremium = btnPremium.cloneNode(true);
    const newStandard = btnStandard.cloneNode(true);
    const newCancel = btnCancel.cloneNode(true);
    btnPremium.parentNode.replaceChild(newPremium, btnPremium);
    btnStandard.parentNode.replaceChild(newStandard, btnStandard);
    btnCancel.parentNode.replaceChild(newCancel, btnCancel);

    newPremium.addEventListener('click', async () => {
        closeModal();
        try {
            showToast("Generating Official (Premium) Credential...", "info");
            await generateAndDownloadPDF(data, db, 'premium');
        } catch (err) {
            console.error(err);
            showToast("Failed to generate credential", "error");
        }
    });

    newStandard.addEventListener('click', async () => {
        closeModal();
        try {
            showToast("Generating Standard Credential...", "info");
            await generateAndDownloadPDF(data, db, 'standard');
        } catch (err) {
            console.error(err);
            showToast("Failed to generate credential", "error");
        }
    });

    newCancel.addEventListener('click', closeModal);

    // Also close when clicking outside
    modal.onclick = (e) => {
        if (e.target === modal) closeModal();
    };
});

    // Profile JSON Download
    document.getElementById('downloadProfileJsonBtn')?.addEventListener('click', () => {
        const data = window.currentUserData || userData;
        if (!data) {
            showToast('Profile data not loaded', 'error');
            return;
        }
        try {
            const exportData = { ...data };
            if (exportData.photoURL && String(exportData.photoURL).startsWith('data:')) {
                exportData.photoURL = '[base64 image omitted]';
            }
            const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `vocalwitness-profile-${(data.username || data.uid || 'user').toString().slice(0, 24)}.json`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showToast('Profile JSON downloaded', 'success');
        } catch (err) {
            console.error(err);
            showToast('Failed to download JSON', 'error');
        }
    });
}

// ====================== SESSIONS & LOGIN HISTORY PLACEHOLDERS ======================
window.renderSessionsPlaceholder = function() {
    const el = document.getElementById('activeSessionsList');
    if (el) {
        el.innerHTML = `<p class="text-xs text-zinc-500">
            Session list requires server-side tracking (not available in browser Auth).
            Use <strong>Sign out</strong> on this device, or <strong>Emergency Clear</strong> to wipe local data.
        </p>`;
    }
    const hist = document.getElementById('loginHistoryList');
    if (hist) {
        hist.innerHTML = `<p class="text-xs text-zinc-500">Login history is not stored yet.</p>`;
    }
};

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
            await syncPublicProfile(auth.currentUser.uid, currentUserData);
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

// ====================== IMAGE PREVIEW + COMPRESSION ======================
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
                    height = height * (MAX_WIDTH / width);
                    width = MAX_WIDTH;
                }
            } else {
                if (height > MAX_HEIGHT) {
                    width = width * (MAX_HEIGHT / height);
                    height = MAX_HEIGHT;
                }
            }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            pendingAvatarBase64 = canvas.toDataURL('image/jpeg', 0.85);
            const imgPreview = document.getElementById('avatarPreview');
            const avatarFallback = document.getElementById('avatarFallback');
            if (imgPreview) {
                imgPreview.src = pendingAvatarBase64;
                imgPreview.classList.remove('hidden');
            }
            if (avatarFallback) {
                avatarFallback.classList.add('hidden');
            }
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}
window.handleImagePreview = handleImagePreview;

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

// ====================== MODAL CLOSE / OPEN ======================
export function closeProfile() {
    const modal = document.getElementById('profileModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
}

export function closeEditProfile() {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
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
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
    }
}

// ====================== EDIT PROFILE FORM ======================
export function populateEditProfileForm() {
    const modal = document.getElementById('editProfileModal');
    if (!modal) return;
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
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
    if (typeof closeProfile === 'function') {
        closeProfile();
    }
}
window.populateEditProfileForm = populateEditProfileForm;

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

    const firstName      = firstNameEl?.value?.trim() || "";
    const lastName       = lastNameEl?.value?.trim() || "";
    const displayName    = displayNameEl?.value?.trim();
    const username       = usernameEl?.value?.trim();
    const region         = regionEl?.value?.trim();
    const bio            = bioEl?.value?.trim();
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
    const user = auth.currentUser;
    if (!user) {
        showToast('Sign in required', 'error');
        return;
    }
    const providers = (user.providerData || []).map(p => p.providerId);
    const hasPassword = providers.includes('password');
    if (!hasPassword) {
        showToast(
            'This account uses Google/Twitter/GitHub sign-in. There is no password to reset. Sign in with that provider instead.',
            'info'
        );
        return;
    }
    if (!user.email) {
        showToast('No email on this account', 'error');
        return;
    }
    try {
        await sendPasswordResetEmail(auth, user.email, {
            url: 'https://vocalwitness.com/profile',
            handleCodeInApp: false
        });
        showToast(
            `Reset link sent to ${user.email}. Check inbox and spam. Link expires in ~1 hour.`,
            'success'
        );
    } catch (error) {
        console.error('Password reset error:', error);
        const msg =
            error.code === 'auth/too-many-requests'
                ? 'Too many attempts. Try again later.'
                : error.code === 'auth/user-not-found'
                  ? 'No password account for this email.'
                  : 'Could not send reset email. Check Firebase Auth email settings.';
        showToast(msg, 'error');
    }
}
window.handlePasswordReset = triggerPasswordReset;

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
        const verifModal =
            document.getElementById('verificationModal') ||
            document.getElementById('phoneVerificationModal');
        if (verifModal) {
            verifModal.classList.remove('hidden');
            verifModal.classList.add('flex');
            verifModal.style.zIndex = '10000';
        } else {
            showToast('Verification module unavailable', 'error');
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
window.handleSignOut = handleSignOut;
window.handleProfileStartCycle = handleProfileStartCycle;
window.triggerPasswordReset = triggerPasswordReset;
window.renderProfileUI = renderProfileUI;
window.initProfile = initProfile;
window.openVerificationModalFromProfile = window.startPhoneVerification;
window.openSettingsModal = window.openSettings;
window.closeSettingsModal = window.closeSettings;
window.saveProfileBio = window.saveUserBio;

// ====================== PROFILE MANAGER ======================
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
                                : 'EXIF & IP stripped via zero-knowledge layer.'}
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
                        showToast('Bold Witness Mode Activated', 'info');
                    });
                } else {
                    AppState.setIdentityMode('ANONYMOUS');
                    this.init();
                    showToast('Switched to ZK-Anonymous Mode', 'success');
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

// ====================== INIT PROFILE MODALS (CSP-safe) ======================
export function initProfileModals() {
    if (window.__vwProfileModalsWired) return;
    window.__vwProfileModalsWired = true;

    document.getElementById('cancelEditProfileBtn')?.addEventListener('click', closeEditProfile);
    document.getElementById('btn-cancel-edit')?.addEventListener('click', closeEditProfile);
    document.getElementById('avatarInput')?.addEventListener('change', handleImagePreview);
    document.getElementById('editProfileForm')?.addEventListener('submit', handleSaveProfile);
    document.getElementById('closeSettingsBtn')?.addEventListener('click', closeSettings);
    document.getElementById('triggerPasswordResetBtn')?.addEventListener('click', triggerPasswordReset);

    // Note: PDF download listener is now only in attachProfileEventListeners()
    // to avoid double-firing

    document.getElementById('settingsSignOutBtn')?.addEventListener('click', handleSignOut);

    document.getElementById('panicClearBtn')?.addEventListener('click', async () => {
        const confirmed = confirm(
            '⚠️ EMERGENCY CLEAR\n\nErases ALL VocalWitness data on THIS device and signs you out.\nPublic ledger is unchanged.\n\nContinue?'
        );
        if (!confirmed) return;
        if (typeof window.panicClearDevice === 'function') {
            await window.panicClearDevice({ redirectUrl: 'https://www.accuweather.com' });
        } else {
            localStorage.clear();
            sessionStorage.clear();
            await handleSignOut();
        }
    });

    // 2FA / MFA toggle
    const toggle2FAEl = document.getElementById('toggle2FA');
    if (toggle2FAEl) {
        try {
            const factors = getEnrolledFactors();
            toggle2FAEl.checked = !!(factors && factors.length);
        } catch (err) {
            console.warn('[profile] MFA status read failed:', err);
        }
        toggle2FAEl.addEventListener('change', async (e) => {
            const user = auth.currentUser;
            if (!user) {
                e.target.checked = false;
                showToast('Sign in required for 2FA', 'error');
                return;
            }
            if (e.target.checked) {
                e.target.checked = false;
                try {
                    const { totpSecret, qrCodeUrl, secretKey } = await enrollTotpMfa();
                    window.__pendingTotpSecret = totpSecret;
                    if (typeof window.openMfaEnrollmentModal === 'function') {
                        window.openMfaEnrollmentModal({ qrCodeUrl, secretKey, totpSecret });
                    } else {
                        const mfaModal = document.getElementById('mfaModal');
                        if (mfaModal) {
                            const qrImg = document.getElementById('mfaQrImage');
                            const secretEl = document.getElementById('mfaSecretKey');
                            if (qrImg) {
                                qrImg.src =
                                    'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' +
                                    encodeURIComponent(qrCodeUrl);
                            }
                            if (secretEl) secretEl.textContent = secretKey;
                            mfaModal.classList.remove('hidden');
                            mfaModal.classList.add('flex');
                        } else {
                            showToast('Add this key in your authenticator app: ' + secretKey, 'info');
                        }
                    }
                } catch (err) {
                    console.error(err);
                    showToast(err.message || 'Could not start 2FA setup', 'error');
                }
            } else {
                try {
                    const factors = getEnrolledFactors();
                    if (factors && factors[0]) {
                        await unenrollMfa(factors[0].uid);
                    }
                } catch (err) {
                    console.error(err);
                    showToast(err.message || 'Failed to disable 2FA', 'error');
                    e.target.checked = true;
                }
            }
        });
    }

    document.getElementById('closeProfileModalBtn')?.addEventListener('click', closeProfile);
    document.getElementById('closeEditProfileBtn')?.addEventListener('click', closeEditProfile);
    document.getElementById('btn-close-edit-profile')?.addEventListener('click', closeEditProfile);

    document.getElementById('profileModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'profileModal') closeProfile();
    });
    document.getElementById('editProfileModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'editProfileModal') closeEditProfile();
    });
    document.getElementById('settingsModal')?.addEventListener('click', (e) => {
        if (e.target.id === 'settingsModal') closeSettings();
    });

    document.getElementById('mfaConfirmBtn')?.addEventListener('click', async () => {
        const code = (document.getElementById('mfaOtpInput')?.value || '').replace(/\D/g, '');
        const secret = window.__pendingTotpSecret;
        if (!secret || code.length !== 6) {
            showToast('Enter the 6-digit code from your authenticator app', 'error');
            return;
        }
        try {
            await finalizeTotpEnrollment(secret, code);
            window.__pendingTotpSecret = null;
            const mfaModal = document.getElementById('mfaModal');
            if (mfaModal) {
                mfaModal.classList.add('hidden');
                mfaModal.classList.remove('flex');
            }
            const toggle = document.getElementById('toggle2FA');
            if (toggle) toggle.checked = true;
        } catch (err) {
            console.error(err);
            showToast(err.message || 'Invalid code — try again', 'error');
        }
    });
}
window.initProfileModals = initProfileModals;

// ====================== SINGLE BOOT ======================
function bootProfileUi() {
    try {
        const manager = new ProfileManager();
        if (manager.profileContainer) manager.init();
    } catch (err) {
        console.warn('[profile] ProfileManager init skipped:', err);
    }
    try {
        initProfileModals();
    } catch (err) {
        console.error('[profile] initProfileModals failed:', err);
    }

    if (document.getElementById('mainProfileContent') ||
        document.getElementById('profileContent') ||
        document.getElementById('modalProfileContent')) {
        if (typeof initProfile === 'function') {
            initProfile();
        }
    }

    document.getElementById('defaultDoorSelect')?.addEventListener('change', (e) => {
        localStorage.setItem('vw_default_page', e.target.value);
        if (typeof showToast === 'function') {
            showToast('Default page saved', 'success');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (typeof closeProfile === 'function') closeProfile();
            if (typeof closeEditProfile === 'function') closeEditProfile();
            if (typeof closeSettings === 'function') closeSettings();
        }
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootProfileUi);
} else {
    bootProfileUi();
}
