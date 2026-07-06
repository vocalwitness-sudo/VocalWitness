// js/navigation.js - Clean Core Features
import { db } from './firebase-config.js';

export async function loadDynamicNavigation() {
    const sidebar = document.getElementById('sidebar-menu');
    if (!sidebar) return;

    try {
        const { collection, getDocs, query, orderBy } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
        
        const q = query(collection(db, "MENU"), orderBy("order"));
        const snapshot = await getDocs(q);

        let html = '<div class="space-y-1">';
        
        snapshot.forEach(doc => {
            const item = doc.data();
            const label = item.label || doc.id.replace('nav_', '').replace('_', ' ');
            const route = item.route || '#'; // safe default
            const icon = item.icon || '📌';

            html += `
                <a href="${route}" class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800 transition-colors">
                    <span class="text-xl">${icon}</span>
                    <span>${label}</span>
                </a>
            `;
        });
        
        html += '</div>';
        sidebar.innerHTML = html;
        
    } catch (e) {
        console.error("Navigation load failed:", e);
        sidebar.innerHTML = '<p class="text-amber-400 p-4">Core sections loading...</p>';
    }
}
