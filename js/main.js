// js/main.js - SIMPLE DEBUG VERSION
console.log("✅ main.js loaded");

// Simple direct button setup
function initButtons() {
    console.log("🔧 Initializing buttons...");

    // Profile Button
    const profileBtn = document.getElementById('btn-profile');
    if (profileBtn) {
        profileBtn.onclick = () => {
            console.log("👤 Profile button clicked!");
            alert("Profile modal should open now");
            const modal = document.getElementById('profileModal');
            if (modal) modal.classList.remove('hidden');
            else console.error("Profile modal not found");
        };
        console.log("✅ Profile button attached");
    } else {
        console.error("❌ Profile button not found in DOM");
    }

    // Guardian Button
    const guardianBtn = document.getElementById('btn-guardian');
    if (guardianBtn) {
        guardianBtn.onclick = () => {
            console.log("🛡️ Guardian button clicked!");
            document.getElementById('guardianModal')?.classList.remove('hidden');
        };
        console.log("✅ Guardian button attached");
    }
}

// Run when page loads
document.addEventListener('DOMContentLoaded', () => {
    console.log("📄 DOM Content Loaded");
    initButtons();
    
    // Load default feed
    if (typeof window.loadFeed === 'function') {
        window.loadFeed('citizen');
    }
});
