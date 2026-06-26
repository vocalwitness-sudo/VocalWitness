// js/profile.js - Defensive & Fixed Version
import { showToast, getTier, calculateTrustScore } from './utils.js';
import { db } from './firebase-config.js';
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let currentProfileUser = null;

export async function loadProfile(user) {
    if (!user) {
        showToast("Please sign in first", "warning");
        return;
    }

    currentProfileUser = user;
    
    let profileSection = document.getElementById('profileSection');
    if (!profileSection) {
        console.error("❌ #profileSection element not found in HTML");
        showToast("Profile section not found in page", "error");
        return;
    }

    // Make sure it's visible
    profileSection.classList.add('active');
    document.getElementById('homeSection')?.classList.remove('active');

    try {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userRef);
        const userData = userSnap.exists() ? userSnap.data() : {};

        const trustScore = calculateTrustScore(userData);
        const tier = getTier(trustScore);

        profileSection.innerHTML = `
            <div class="p-6 max-w-2xl mx-auto">
                <div class="flex justify-between items-center mb-6">
                    <h2 class="text-3xl font-bold flex items-center gap-3">👤 My Profile</h2>
                    <button onclick="hideProfileSection()" 
                            class="px-5 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl text-sm">✕ Close</button>
                </div>

                <div class="glass rounded-3xl p-8">
                    <div class="flex flex-col items-center mb-8">
                        <div class="w-32 h-32 rounded-3xl overflow-hidden border-4 border-emerald-500 shadow-xl">
                            <img src="${user.photoURL || 'https://via.placeholder.com/150?text=👤'}" 
                                 class="w-full h-full object-cover" alt="Profile Picture">
                        </div>
                        <h3 class="mt-4 text-2xl font-semibold">${user.displayName || user.email}</h3>
                        <p class="text-emerald-400">@${userData.username || 'citizen'}</p>
                    </div>

                    <div class="text-center mb-8">
                        <div class="inline-flex items-center gap-3 bg-zinc-900 px-8 py-4 rounded-3xl">
                            <span style="color: ${tier.color}" class="text-4xl">${tier.badge || '🌟'}</span>
                            <div class="text-left">
                                <p class="font-bold text-xl">${tier.name} Tier</p>
                                <p class="text-sm text-zinc-400">Trust Score: ${trustScore}/100</p>
                            </div>
                        </div>
                    </div>

                    <div class="grid grid-cols-2 gap-4 mb-8">
                        <div class="bg-zinc-900/70 p-6 rounded-2xl text-center">
                            <p class="text-4xl font-bold text-emerald-400">${userData.testimoniesCount || 0}</p>
                            <p class="text-zinc-400">Testimonies</p>
                        </div>
                        <div class="bg-zinc-900/70 p-6 rounded-2xl text-center">
                            <p class="text-4xl font-bold text-emerald-400">${userData.verificationsMade || 0}</p>
                            <p class="text-zinc-400">Verifications</p>
                        </div>
                    </div>

                    <div class="mb-8">
                        <label class="block text-sm text-zinc-400 mb-3">Bio</label>
                        <textarea id="bioInput" rows="4" 
                                  class="w-full bg-zinc-900 border border-zinc-700 rounded-2xl p-5 text-zinc-100 focus:outline-none focus:border-emerald-500"
                                  placeholder="Write something about yourself...">${userData.bio || ''}</textarea>
                    </div>

                    <button onclick="saveProfileChanges()" 
                            class="w-full py-4 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-semibold text-lg transition">
                        💾 Save Profile Changes
                    </button>
                </div>
            </div>
        `;

        console.log("✅ Profile rendered successfully");
    } catch (error) {
        console.error("Profile error:", error);
        showToast("Could not load profile details", "error");
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
        showToast("✅ Profile saved successfully", "success");
        loadProfile(currentProfileUser);
    } catch (error) {
        console.error(error);
        showToast("Failed to save profile", "error");
    }
}

// Global functions
window.hideProfileSection = function() {
    document.getElementById('profileSection')?.classList.remove('active');
    document.getElementById('homeSection')?.classList.add('active');
};

window.saveProfileChanges = saveProfileChanges;
