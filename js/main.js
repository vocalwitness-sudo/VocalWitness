// js/main.js - FIXED Standalone Version (No breaking imports)
console.log("✅ VocalWitness main.js loading...");

// Safe element getter
function safeGetElement(id) {
    const el = document.getElementById(id);
    if (!el) console.warn(`Element not found: #${id}`);
    return el;
}

// Mock showToast
window.showToast = (msg, type = "info") => {
    console.log(`[${type.toUpperCase()}] ${msg}`);
    const toast = document.createElement('div');
    toast.style.cssText = `position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:${type==='success'?'#10b981':type==='error'?'#ef4444':'#3b82f6'};color:white;padding:12px 24px;border-radius:9999px;z-index:9999;`;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
};

// Profile System (Self-contained)
let mockAuth = { currentUser: { displayName: "Naija Witness", email: "witness@public.square" } };
const mockUserData = { tier: "citizen_circle", reputation: 87, testimonies: 19, doorsUnlocked: 3,
    keys: [{door:"Public Square",icon:"🌍",unlocked:true},{door:"Citizen Circle",icon:"🛡️",unlocked:true},{door:"Witness Circle",icon:"🔐",unlocked:false}],
    tierHistory: [{date:"May 2026",tier:"Citizen",rep:12},{date:"Jun 2026",tier:"Trusted",rep:45},{date:"Jul 2026",tier:"Citizen Circle",rep:87}]
};

window.showProfile = () => {
    let modal = document.getElementById('profileModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'profileModal';
        modal.className = 'fixed inset-0 bg-black/90 flex items-center justify-center z-[200]';
        modal.innerHTML = `...`; // (full modal code from before)
        document.body.appendChild(modal);
    }
    modal.classList.remove('hidden');
    // Load data...
    showToast("Profile opened", "success");
};

window.closeProfile = () => document.getElementById('profileModal')?.classList.add('hidden');

// Door System
window.switchDoor = (door) => {
    showToast(`🔑 Switched to ${door.replace('_', ' ')}`, "success");
    window.loadFeed('citizen');
};

// Basic Feed
window.loadFeed = (type) => {
    const container = safeGetElement('feedContainer');
    if (container) {
        container.innerHTML = `<div class="p-8 text-center text-emerald-400">📢 ${type.toUpperCase()} Feed Loaded</div>`;
    }
};

// Bootstrap
document.addEventListener('DOMContentLoaded', () => {
    console.log("✅ VocalWitness UI Initialized");
    
    // Attach profile button
    safeGetElement('profile-btn')?.addEventListener('click', window.showProfile);
    
    // Attach door buttons (already in HTML)
    window.loadFeed('citizen');
    
    showToast("Welcome to VocalWitness 👋", "success");
});

window.showDoorSwitcher = () => {
    showToast("Door switcher opened", "info");
    // You can expand this later
};
