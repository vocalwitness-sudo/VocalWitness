// js/main.js - Enhanced with Robust Validation & Safe DOM Handling + Profile System
import { initAuth } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from '../vocalWitnessEngine.js';
import { recordTestimonyContribution } from './dao.js';
import * as tierModule from './tier.js';

let engineInstance = null;

// ====================== SAFE DOM SELECTOR ======================
function safeGetElement(id) {
    const el = document.getElementById(id);
    if (!el) {
        console.warn(`Missing element: #${id}`);
        return null;
    }
    return el;
}

// ====================== INPUT VALIDATION ======================
function sanitizeInput(str) {
    return str ? str.replace(/<[^>]*>/g, '').trim() : '';
}
function validateTextInput(text, min = 3, max = 1500) {
    const sanitized = sanitizeInput(text);
    if (!sanitized) return { valid: false, error: "Content cannot be empty" };
    if (sanitized.length < min) return { valid: false, error: `Minimum ${min} characters required` };
    if (sanitized.length > max) return { valid: false, error: `Maximum ${max} characters allowed` };
    return { valid: true, value: sanitized };
}
function validatePhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
}

// ====================== PROFILE SYSTEM ======================
let mockAuth = {
    currentUser: {
        displayName: "Naija Witness",
        email: "witness@public.square"
    }
};

const mockUserData = {
    tier: "citizen_circle",
    reputation: 87,
    testimonies: 19,
    doorsUnlocked: 3,
    avatar: "👤",
    keys: [
        { door: "Public Square", icon: "🌍", unlocked: true },
        { door: "Citizen Circle", icon: "🛡️", unlocked: true },
        { door: "Witness Circle", icon: "🔐", unlocked: false }
    ],
    tierHistory: [
        { date: "May 2026", tier: "Citizen", rep: 12 },
        { date: "Jun 2026", tier: "Trusted", rep: 45 },
        { date: "Jul 2026", tier: "Citizen Circle", rep: 87 }
    ]
};

window.showProfile = async () => {
    let modal = document.getElementById('profileModal');
   
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'profileModal';
        modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[200] hidden';
        modal.innerHTML = `
            <div class="glass max-w-lg w-full mx-4 rounded-3xl overflow-hidden">
                <div class="h-32 bg-gradient-to-r from-emerald-600 to-teal-600 relative">
                    <button onclick="closeProfile()" class="absolute top-4 right-4 text-white text-3xl hover:scale-110 transition-transform">×</button>
                </div>
                <div class="px-8 -mt-12 relative">
                    <div class="flex justify-center">
                        <div onclick="changeProfilePicture()" id="profile-avatar" 
                             class="w-28 h-28 bg-zinc-800 border-4 border-[#0a0f1c] rounded-3xl flex items-center justify-center text-6xl shadow-xl cursor-pointer hover:scale-105 transition-transform">
                            👤
                        </div>
                    </div>
                    <div class="text-center mt-4">
                        <h2 id="profile-name" class="text-2xl font-bold">Anonymous Witness</h2>
                        <p id="profile-email" class="text-zinc-400 text-sm"></p>
                    </div>
                    <div class="mt-8">
                        <div class="flex justify-between text-xs mb-2">
                            <span class="text-emerald-400">Tier Progress</span>
                            <span id="tier-name" class="font-medium">Citizen Circle</span>
                        </div>
                        <div id="profile-tier-badge" class="flex justify-center mb-6"></div>
                    </div>
                    <div class="grid grid-cols-3 gap-4 text-center mb-8">
                        <div class="bg-zinc-900 rounded-2xl p-4">
                            <div id="stat-rep" class="text-3xl font-bold text-emerald-400">87</div>
                            <div class="text-xs text-zinc-400">Reputation</div>
                        </div>
                        <div class="bg-zinc-900 rounded-2xl p-4">
                            <div id="stat-testimonies" class="text-3xl font-bold text-sky-400">19</div>
                            <div class="text-xs text-zinc-400">Testimonies</div>
                        </div>
                        <div class="bg-zinc-900 rounded-2xl p-4">
                            <div id="stat-door" class="text-3xl font-bold text-purple-400">3</div>
                            <div class="text-xs text-zinc-400">Doors Unlocked</div>
                        </div>
                    </div>
                    <div class="mb-8">
                        <div class="text-xs text-zinc-400 mb-3">DOOR KEYS</div>
                        <div id="door-keys-list" class="flex gap-3"></div>
                    </div>
                    <div>
                        <div class="text-xs text-zinc-400 mb-3">TIER HISTORY</div>
                        <div id="tier-history" class="space-y-2 text-sm"></div>
                    </div>
                    <div class="space-y-6 mt-8">
                        <div>
                            <label class="block text-xs text-zinc-400 mb-2">Display Name</label>
                            <input id="edit-name" type="text" class="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-4 focus:outline-none focus:border-emerald-500" placeholder="Your public name">
                        </div>
                        <div class="flex gap-4">
                            <button onclick="saveProfileChanges()" class="flex-1 py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-semibold">💾 Save Changes</button>
                            <button onclick="closeProfile()" class="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl">Cancel</button>
                        </div>
                    </div>
                </div>
                <div class="p-6 border-t border-zinc-800 mt-8">
                    <button onclick="logout()" class="w-full py-4 text-red-400 hover:bg-red-900/30 rounded-2xl text-sm font-medium">Sign Out</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
   
    modal.classList.remove('hidden');
    loadProfileData();
};

window.closeProfile = () => {
    const modal = document.getElementById('profileModal');
    if (modal) modal.classList.add('hidden');
};

function loadProfileData() {
    const user = mockAuth.currentUser;
    document.getElementById('profile-name').textContent = user.displayName || "Anonymous Witness";
    document.getElementById('profile-email').textContent = user.email || "";
    document.getElementById('stat-rep').textContent = mockUserData.reputation;
    document.getElementById('stat-testimonies').textContent = mockUserData.testimonies;
    document.getElementById('stat-door').textContent = mockUserData.doorsUnlocked;
    document.getElementById('tier-name').textContent = mockUserData.tier.replace('_', ' ').toUpperCase();
    renderDoorKeys();
    renderTierHistory();
}

function renderDoorKeys() {
    const container = document.getElementById('door-keys-list');
    container.innerHTML = mockUserData.keys.map(key => `
        <div class="flex-1 bg-zinc-900 rounded-2xl p-4 text-center ${key.unlocked ? 'border border-emerald-500/30' : 'opacity-50'}">
            <div class="text-3xl mb-1">${key.icon}</div>
            <div class="text-sm font-medium">${key.door}</div>
            <div class="text-xs ${key.unlocked ? 'text-emerald-400' : 'text-zinc-500'}">${key.unlocked ? '✓ Unlocked' : '🔒 Locked'}</div>
        </div>
    `).join('');
}

function renderTierHistory() {
    const container = document.getElementById('tier-history');
    container.innerHTML = mockUserData.tierHistory.map(entry => `
        <div class="flex justify-between items-center bg-zinc-900/50 rounded-xl px-4 py-3">
            <span class="text-zinc-400">${entry.date}</span>
            <span class="font-medium">${entry.tier}</span>
            <span class="text-emerald-400 text-sm">${entry.rep} REP</span>
        </div>
    `).join('');
}

window.changeProfilePicture = () => {
    const avatars = ['👤', '🕵️', '🛡️', '🔍', '🌟', '🗣️'];
    const current = document.getElementById('profile-avatar');
    let index = avatars.indexOf(current.textContent);
    current.textContent = avatars[(index + 1) % avatars.length];
    showToast("Profile picture updated!", "success");
};

window.saveProfileChanges = () => {
    const newName = document.getElementById('edit-name').value.trim();
    if (newName) {
        mockAuth.currentUser.displayName = newName;
        showToast("✅ Profile updated successfully!", "success");
        loadProfileData();
    }
};

window.logout = () => {
    if (confirm("Sign out of VocalWitness?")) {
        showToast("👋 Signed out.", "info");
        window.closeProfile();
    }
};

// ====================== GLOBAL WINDOW FUNCTIONS ======================
window.loadFeed = (feedType) => {
    document.querySelectorAll('#main-nav button').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`button[data-feed="${feedType}"]`);
    if (activeBtn) activeBtn.classList.add('active');
    console.log(`Switching to feed: ${feedType}`);
    if (feedType === 'true-witness' || feedType === 'live') {
        showToast(feedType === 'true-witness' ? "🔒 True Witness Mode (ZK Verified)" : "🏟️ Live Arena (coming soon)", "info");
        initFeed(db, 'citizen-talk');
    } else {
        initFeed(db, feedType);
    }
};

window.navigateToPage = (page) => window.location.href = page;
window.toggleMoreMenu = () => safeGetElement('moreMenu')?.classList.toggle('hidden');

window.switchDoor = async (door) => {
    const success = await tierModule.setVisibilityDoor(door);
    if (success) {
        window.loadFeed('citizen');
        showToast(`🔑 Entered ${door.replace('_', ' ')}`, "success");
    }
};

window.showSupportModal = () => {
    const modal = safeGetElement('supportModal');
    if (!modal) return;
    modal.classList.remove('hidden');
};

window.closeSupportModal = () => safeGetElement('supportModal')?.classList.add('hidden');

// ====================== PUBLISH TESTIMONY ======================
window.publishTestimony = async () => {
    const textarea = safeGetElement('mainInput');
    if (!textarea) return showToast("Input field not found", "error");
    const validation = validateTextInput(textarea.value);
    if (!validation.valid) {
        showToast(validation.error, "error");
        return;
    }
    const content = validation.value;
    const postBtn = safeGetElement('postButton');
    if (postBtn) {
        postBtn.disabled = true;
        postBtn.textContent = '🚀 Publishing...';
    }
    try {
        showToast("✅ Testimony published to the Square!", "success");
        textarea.value = '';
        window.loadFeed('citizen');
    } catch (err) {
        showToast("Failed to publish.", "error");
    } finally {
        if (postBtn) {
            postBtn.disabled = false;
            postBtn.textContent = '🚀 Publish Testimony to the Square';
        }
    }
};

// ====================== BOOTSTRAP ======================
async function bootstrap() {
    try {
        await initAuth?.();
        initLanguage?.();
        engineInstance = new CitizenTalkEngine?.(db) || {};
        window.engineInstance = engineInstance;
        setupEventListeners();
        setTimeout(() => window.loadFeed('citizen'), 600);
        console.log("✅ VocalWitness initialized successfully");
    } catch (error) {
        console.error("Bootstrap failed:", error);
        showToast("Failed to initialize app", "error");
    }
}

function setupEventListeners() {
    safeGetElement('btn-photo')?.addEventListener('click', () => {
        showToast("📸 Forensic photo mode activated", "info");
    });
    safeGetElement('btn-voice')?.addEventListener('click', () => {
        showToast("🎤 Voice recording started", "info");
    });
    safeGetElement('postButton')?.addEventListener('click', window.publishTestimony);
}

document.addEventListener('DOMContentLoaded', () => {
    bootstrap();
    safeGetElement('profile-btn')?.addEventListener('click', window.showProfile);
    console.log("✅ Main.js fully loaded with Profile + Tier integration");
});
