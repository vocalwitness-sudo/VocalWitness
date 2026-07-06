// js/navigation.js - With Strong Fallback
export async function loadDynamicNavigation() {
    const sidebar = document.getElementById('sidebar-menu');
    if (!sidebar) return;

    // Fallback content if Firestore fails
    sidebar.innerHTML = `
        <div class="space-y-1">
            <a href="/" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800">💬 Citizen Talk</a>
            <a href="/" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800">🔬 True Witness</a>
            <a href="/" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800">🏟️ Live Arena</a>
            <a href="/about" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800">ℹ️ About Us</a>
            <a href="/privacy" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800">🔒 Privacy</a>
        </div>
    `;

    console.log("✅ Fallback sidebar loaded");
}
