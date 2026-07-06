// js/navigation.js - SIMPLE HARDCODED FOR TESTING
export async function loadDynamicNavigation() {
    const sidebar = document.getElementById('sidebar-menu');
    if (!sidebar) return;

    sidebar.innerHTML = `
        <div class="space-y-1">
            <a href="/citizen-talk" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800">💬 Citizen Talk</a>
            <a href="/true-witness" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800">🔬 True Witness</a>
            <a href="/live-arena" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800">🏟️ Live Arena</a>
            <a href="/about" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800">ℹ️ About</a>
        </div>
    `;
    console.log("✅ Hardcoded sidebar loaded");
}
