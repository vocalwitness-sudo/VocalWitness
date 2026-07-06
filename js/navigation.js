// js/navigation.js - Updated to match your Firestore MENU
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
            const id = doc.id;
            
            // Handle your current structure (nav_ documents)
            const label = item.label || item.name || id.replace('nav_', '').replace('_', ' ');
            const route = item.route || `/${id.replace('nav_', '')}`;
            const icon = item.icon || '📌';
            const badge = item.badge || '';

            html += `
                <a href="${route}"
                   class="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-800 transition-colors nav-item">
                    <span class="text-xl">${icon}</span>
                    <span class="capitalize">${label}</span>
                    ${badge ? `<span class="ml-auto text-xs bg-yellow-500 text-black px-2 py-0.5 rounded-full">${badge}</span>` : ''}
                </a>
            `;
        });

        html += '</div>';
        sidebar.innerHTML = html;
        
    } catch (e) {
        console.error("Navigation load failed:", e);
        sidebar.innerHTML = `<p class="text-red-400 p-4">Menu failed to load. Check console.</p>`;
    }
}
