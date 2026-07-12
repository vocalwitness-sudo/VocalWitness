import { auth, db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { initFeed } from './feed.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js'; // Add this import

document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Localization
    initLanguage(); 
    
    // 2. Initialize Feed
    initFeed(db, 'public_square');
});

console.log("🚀 VocalWitness Production Engine Loading...");

// 1. Manually expose functions to the global scope
window.navigateToPage = (page) => window.location.href = page;
window.showSupportModal = () => document.getElementById('supportModal')?.classList.remove('hidden');
window.switchDoor = (door) => { 
    console.log("Switching to:", door);
};

window.switchDoor = async (door) => {
    // Logic to update user preference in Firestore and trigger feed refresh
    showToast(`🔑 Switching to ${door.replace('_', ' ')}...`, "info");
    initFeed(db, door);
};

// --- Live Profile Loader ---
window.showProfile = async () => {
    if (!auth.currentUser) return showToast("Please sign in first", "error");
    
    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    const data = userDoc.exists() ? userDoc.data() : {};
    
    let modal = document.getElementById('profileModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'profileModal';
        modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[200] p-4';
        document.body.appendChild(modal);
    }
    
    modal.innerHTML = `
        <div class="glass max-w-sm w-full rounded-3xl p-6 border border-zinc-700">
            <h2 class="text-xl font-bold mb-4">${data.displayName || 'Witness'}</h2>
            <p class="text-emerald-400 text-sm mb-4">Reputation: ${data.credibilityScore || 0}</p>
            <button onclick="closeProfile()" class="w-full py-3 bg-zinc-800 rounded-2xl">Close</button>
        </div>
    `;
    modal.classList.remove('hidden');
};

window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Feed with default door
    initFeed(db, 'public_square');

    // 2. Auth Listener
    auth.onAuthStateChanged((user) => {
        if (user) {
            console.log("✅ Authenticated as:", user.email);
            const btn = document.getElementById('profile-btn');
            if (btn) btn.innerText = "View Profile";
        }
    });

    showToast("VocalWitness is Live", "success");
});

// DEBUG TRIGGER
console.log("DEBUG: Main.js has finished parsing");
document.addEventListener('click', (e) => {
    console.log("DEBUG: Click detected on:", e.target.tagName, e.target.id);
});
