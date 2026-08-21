// js/navigation.js - Single Page App Integrated Version
import { db, auth } from './firebase-config.js';
import { navigateTo } from './router.js';

export const menuItems = [
    { id: "citizen-talk", icon: "💬", label: "Citizen Talk", route: "citizen-talk" },
    { id: "witness-voice", icon: "🔬", label: "Witness Voice", route: "witness-voice" },
    { id: "arena", icon: "🏟️", label: "Live Arena", route: "arena" },
    { id: "audit-log", icon: "📊", label: "Forensic Ledger", route: "audit-log" },
    { id: "my-testimonies", icon: "📜", label: "My Testimonies", route: "profile" }
];

export function loadDynamicNavigation() {
    function tryLoadNav() {
        const navContainer = document.getElementById('main-sidebar-nav');
        if (!navContainer) return false;

        navContainer.innerHTML = '';

        const currentHash = window.location.hash.slice(1) || 'citizen-talk';

        menuItems.forEach(item => {
            const isActive = currentHash === item.route;

            const link = document.createElement('a');
            link.href = `#${item.route}`;
            link.setAttribute('data-route', item.route);
            link.className = `flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group cursor-pointer ${
                isActive ? 
                'bg-emerald-500 text-black font-semibold' : 
                'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`;
            
            link.innerHTML = `
                <span class="text-xl transition-transform group-hover:scale-110">${item.icon}</span>
                <span>${item.label}</span>
            `;

            // Intercept click to trigger client router directly
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(item.route);
            });

            navContainer.appendChild(link);
        });

        console.log("✅ Sidebar SPA navigation loaded");
        return true;
    }

    if (!tryLoadNav()) {
        setTimeout(() => {
            if (!tryLoadNav()) setTimeout(tryLoadNav, 600);
        }, 400);
    }
}

export function initMobileMenu() {
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    if (mobileBtn && sidebar) {
        mobileBtn.addEventListener('click', () => sidebar.classList.toggle('hidden'));
    }
}
