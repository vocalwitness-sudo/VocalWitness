import { auth, db } from './firebase-config.js';
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { initFeed } from './feed.js';
import { showToast } from './utils.js';
import { initLanguage } from './i18n.js';

// --- Single Source of Truth for Clicks ---
document.addEventListener('click', (e) => {
    const target = e.target;
    
    // Debug logging (Single instance)
    console.log("DEBUG: Click detected on:", target.tagName, target.id || target.dataset.action);

    // Navigation
    const nav = target.closest('[data-action="navigate"]');
    if (nav) window.location.href = nav.dataset.page;

    // Feed Loading
    const feed = target.closest('[data-action="load-feed"]');
    if (feed) initFeed(db, feed.dataset.type);

    // Profile Actions
    if (target.id === 'profile-btn') showProfile();
    if (target.id === 'close-profile-btn') closeProfile();
    
    // Support Modal
    if (target.id === 'support-btn') {
        document.getElementById('supportModal')?.classList.remove('hidden');
    }
});

// --- Modular UI Functions ---
const showProfile = async () => {
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
            <button id="close-profile-btn" class="w-full py-3 bg-zinc-800 rounded-2xl hover:bg-zinc-700 transition">Close</button>
        </div>
    `;
    modal.classList.remove('hidden');
};

const closeProfile = () => {
    document.getElementById('profileModal')?.classList.add('hidden');
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    initFeed(db, 'public_square');
    initLanguage();
    
    auth.onAuthStateChanged((user) => {
        if (user) {
            const btn = document.getElementById('profile-btn');
            if (btn) btn.innerText = "View Profile";
        }
    });
});


// ====================== DOOR SWITCHER (Public Square / Contexts) ======================
window.showDoorSwitcher = function() {
    console.log("🚪 Door Switcher activated");
    
    const doorEl = document.querySelector("#current-door, [data-current-door], .current-door");
    if (!doorEl) {
        showToast("Door system initializing...", "info");
        return;
    }

    // Simple cycling for launch (you can expand later)
    const availableDoors = [
        "Public Square",
        "Citizen Talk", 
        "True Witness",
        "Live Arena",
        "Groups"
    ];
    
    let current = doorEl.textContent.trim();
    let currentIndex = availableDoors.indexOf(current);
    let nextIndex = (currentIndex + 1) % availableDoors.length;
    
    doorEl.textContent = availableDoors[nextIndex];
    doorEl.style.transition = "all 0.3s ease";
    
    showToast(`🚪 Switched to ${availableDoors[nextIndex]}`, "success");
    
    // Future: Load different feeds/contexts
    if (availableDoors[nextIndex] === "Citizen Talk") {
        window.loadFeed('citizen');
    }
};
registerGlobalFunctions({
    publishTestimony,
    loadFeed,
    showSupportModal,
    showDoorSwitcher,     // ← ADD THIS LINE
});
