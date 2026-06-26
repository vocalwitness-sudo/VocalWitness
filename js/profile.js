// js/profile.js - Clean & Upgraded Profile Module
import { showToast, getTier, calculateTrustScore } from './utils.js';
import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let currentProfileUser = null;

export async function loadProfile(user) {
    if (!user) {
        showToast("Please sign in to view profile", "warning");
        return;
    }

    currentProfileUser = user;
    const profileSection = document.getElementById('profileSection');
    if (!profileSection) return;

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};

        const trustScore = calculateTrustScore(userData);
        const tier = getTier(trustScore);

        profileSection.innerHTML = `
            <div class="max-w-2xl mx-auto p-6">
                <div class="flex justify-between items-center mb-8">
                    <h2 class="text-3xl font-bold">👤 My Profile</h2>
                    <button onclick="hideProfileSection()" 
                            class="px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl transition">Close</button>
                </div>

                <div class="glass rounded-3xl p-8">
                    <div class="flex flex-col items-center mb-8">
                        <div class="w-28 h-28 rounded-3xl overflow-hidden border-4 border-emerald-500">
                            <img src="${user.photoURL || 'https://via.placeholder.com/150?text=👤'}" 
                                 class="w-full h-full object-cover" alt="Profile">
                        </div>
                        <h3 class="mt-4 text-2xl font-semibold">${user.displayName || user.email}</h3>
                        <p class="text-emerald-400">@${userData.username || 'citizen'}</p>
                    </div>

                    <div class="text-center mb-8">
                        <div class="inline-flex items-center gap-2 bg-zinc-900 px-6 py-3 rounded-2xl">
                            <span style="color: ${tier.color}" class="text-3xl">${tier.badge || '🌟'}</span>
                            <div>
                                <p class="font-bold text-lg">${tier.name} Tier</p>
                                <p class="text-xs text-zinc-400">Trust Score: ${trustScore}/100</p>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-8">
                        <div class="bg-zinc-900 p-5 rounded-2xl text-center">
                            <p class="text-3xl font-bold text-emerald-400">${userData.testimoniesCount || 0}</p>
                            <p class="text-sm text-zinc-400">Testimonies</p>
                        </div>
                        <div class="bg-zinc-900 p-5 rounded-2xl text-center">
                            <p class="text-3xl font-bold text-emerald-400">${userData.verificationsMade || 0}</p>
                            <p class="text-sm text-zinc-400">Verifications</p>
                        </div>
                    </div>

                    <div class="mb-6">
                        <label class="block text-sm text-zinc-400 mb-2">Bio</label>
                        <textarea id="bioInput" class="w-full h-24 bg-zinc-900 rounded-2xl p-4 text-zinc-100" 
                                  placeholder="Tell us about yourself...">${userData.bio || ''}</textarea>
                    </div>

                    <button onclick="saveProfileChanges()" 
                            class="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-medium transition">
                        💾 Save Changes
                    </button>
                </div>
            </div>
        `;

        console.log("✅ Profile loaded");
    } catch (error) {
        console.error("Profile load error:", error);
        showToast("Failed to load profile", "error");
    }
}

export async function saveProfileChanges() {
    if (!currentProfileUser) return;

    const bioInput = document.getElementById('bioInput');
    if (!bioInput) return;

    try {
        const userRef = doc(db, "users", currentProfileUser.uid);
        await updateDoc(userRef, {
            bio: bioInput.value.trim(),
            lastUpdated: new Date().toISOString()
        });
        showToast("Profile updated successfully!", "success");
        loadProfile(currentProfileUser);
    } catch (error) {
        console.error("Save profile error:", error);
        showToast("Failed to save changes", "error");
    }
}

// Global functions for HTML buttons
window.hideProfileSection = () => {
    const home = document.getElementById('homeSection');
    const profile = document.getElementById('profileSection');
    if (profile) profile.classList.remove('active');
    if (home) home.classList.add('active');
};

window.saveProfileChanges = saveProfileChanges;
