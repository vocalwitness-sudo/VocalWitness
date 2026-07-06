// js/navigation.js - HARDCODED TEST VERSION
export async function loadDynamicNavigation() {
    const sidebar = document.getElementById('sidebar-menu');
    if (!sidebar) {
        console.error("Sidebar element not found");
        return;
    }

    console.log("✅ Hardcoded navigation loaded");

    sidebar.innerHTML = `
        <div class="space-y-1">
            <a href="/citizen-talk" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800 transition-colors">
                💬 <span>Citizen Talk</span>
            </a>
            <a href="/true-witness" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800 transition-colors">
                🔬 <span>True Witness</span>
            </a>
            <a href="/live-arena" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800 transition-colors">
                🏟️ <span>Live Arena</span>
            </a>
            <a href="/about" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800 transition-colors">
                ℹ️ <span>About Us</span>
            </a>
            <a href="/privacy" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800 transition-colors">
                🔒 <span>Privacy</span>
            </a>
        </div>
    `;
}
