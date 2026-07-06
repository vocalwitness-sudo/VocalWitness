// js/navigation.js - Final Robust Version
export const menuItems = [
    { id: "citizen-talk", icon: "💬", label: "Citizen Talk", href: "/" },
    { id: "true-witness", icon: "🔬", label: "True Witness", href: "/true-witness" },
    { id: "live-arena", icon: "🏟️", label: "Live Arena", href: "/live-arena" },
    { id: "forensic-ledger", icon: "📊", label: "Forensic Ledger", href: "/forensic-ledger" },
    { id: "my-testimonies", icon: "📜", label: "My Testimonies", href: "/my-testimonies" }
];

export function loadDynamicNavigation() {
    function tryLoadNav() {
        const navContainer = document.getElementById('main-sidebar-nav');
        if (navContainer) {
            navContainer.innerHTML = '';

            menuItems.forEach(item => {
                const currentPath = window.location.pathname.replace(/\.html$/, '') || '/';
                const isActive = currentPath === item.href || (currentPath === '/' && item.id === 'citizen-talk');

                const link = document.createElement('a');
                link.href = item.href;
                link.className = `flex items-center gap-3 px-4 py-3 rounded-2xl transition-all group ${isActive ? 
                    'bg-emerald-500 text-black font-semibold' : 
                    'text-zinc-400 hover:text-white hover:bg-zinc-900'}`;
                
                link.innerHTML = `<span class="text-xl">${item.icon}</span><span>${item.label}</span>`;
                navContainer.appendChild(link);
            });
            console.log("✅ Sidebar navigation loaded successfully");
            return true;
        }
        return false;
    }

    // Try immediately and then retry
    if (!tryLoadNav()) {
        setTimeout(() => {
            if (!tryLoadNav()) {
                console.warn("Sidebar still not found after retry");
            }
        }, 800);
    }
}

export function initMobileMenu() {
    const mobileBtn = document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('sidebar');
    if (mobileBtn && sidebar) {
        mobileBtn.addEventListener('click', () => sidebar.classList.toggle('hidden'));
    }
}
