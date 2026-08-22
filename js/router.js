// js/router.js - Clean Client-Side Router with pushState + Web Component ready structure
import { showToast } from './utils.js';

const ROUTES = {
    'citizen-talk': {
        viewId: 'citizenTalkView',
        title: 'Citizen Talk',
        init: async () => {
            const { initFeed } = await import('./feed.js');
            initFeed(undefined, 'citizen-talk');
        }
    },
    'witness-voice': {
        viewId: 'witnessVoiceView',
        title: 'Witness Voice',
        init: async () => {
            const { initFeed } = await import('./feed.js');
            initFeed(undefined, 'witness-voice');
        }
    },
    'moderation': {
        viewId: 'moderationView',
        title: 'Steward Moderation',
        init: async () => {
            const { initModeration } = await import('./moderation.js');
            initModeration();
        }
    },
    'profile': {
        viewId: 'profileView',
        title: 'Witness Profile',
        init: async () => {
            const { initProfile } = await import('./profile.js');
            initProfile?.();
        }
    },
    'audit-log': {
        viewId: 'auditLogView',
        title: 'Forensic Audit Log',
        init: async () => {
            const auditModule = await import('./audit.js').catch(() => null);
            auditModule?.initAuditLog?.();
        }
    },
    'arena': {
        viewId: 'arenaView',
        title: 'Live Arena',
        init: async () => {
            const container = document.getElementById('arenaView');
            if (container) {
                container.innerHTML = `<div class="text-center py-16 text-emerald-400 animate-pulse">Initializing Live Arena & ZK Workers...</div>`;
            }
            const arenaModule = await import('./arena.js').catch((err) => {
                console.error("Failed to load Arena module:", err);
                return null;
            });
            arenaModule?.initLiveArena?.(container);
        }
    },
    'quadratic-vote': {
        viewId: 'quadraticVoteView',
        title: 'Quadratic Voting',
        init: async () => {
            const container = document.getElementById('quadraticVoteView');
            if (container) {
                container.innerHTML = `<div class="text-center py-16 text-amber-400 animate-pulse">Loading Quadratic Voting Engine...</div>`;
            }
            const qvModule = await import('./quadraticVoting.js').catch((err) => {
                console.error("Failed to load Quadratic Voting module:", err);
                return null;
            });
            qvModule?.initQuadraticVoting?.(container);
        }
    },
    // DAO is now a first-class route (no special redirect logic)
    'dao': {
        viewId: 'daoView',               // Preferred: in-app panel
        title: 'DAO Governance',
        // Fallback: if the panel does not exist, go to the standalone page
        fallbackUrl: 'dao.html',
        init: async (container) => {
            if (!container) return;
            container.innerHTML = `<div class="text-center py-16 text-emerald-400 animate-pulse">Loading DAO Governance...</div>`;

            // You can later replace this with a real Web Component or module
            // Example future path:
            // const { initDAO } = await import('./dao-ui.js');
            // initDAO(container);

            // For now we keep the simple fallback behavior inside init
            // so the router itself stays clean
        }
    }
};

/**
 * Hide every registered view panel
 */
function hideAllViews() {
    Object.values(ROUTES).forEach(route => {
        if (!route.viewId) return;
        const panel = document.getElementById(route.viewId);
        if (panel) {
            panel.classList.add('hidden');
            panel.classList.remove('block');
        }
    });
}

/**
 * Update active state on navigation elements
 */
function updateNavActiveState(routeKey) {
    document.querySelectorAll('[data-route]').forEach(navBtn => {
        const routeAttr = navBtn.getAttribute('data-route');
        const isActive = routeAttr === routeKey;

        navBtn.classList.toggle('bg-zinc-800', isActive);
        navBtn.classList.toggle('text-emerald-400', isActive);
        navBtn.classList.toggle('text-zinc-400', !isActive);
        navBtn.classList.toggle('bg-emerald-500', isActive);
        navBtn.classList.toggle('text-black', isActive);
        navBtn.classList.toggle('font-semibold', isActive);
    });
}

/**
 * Core navigation function
 */
export async function navigateTo(routeKey, { replace = false } = {}) {
    const targetRoute = ROUTES[routeKey] || ROUTES['citizen-talk'];
    const finalKey = ROUTES[routeKey] ? routeKey : 'citizen-talk';

    // 1. Hide all views
    hideAllViews();

    // 2. Try to show the in-app panel
    let activePanel = null;
    if (targetRoute.viewId) {
        activePanel = document.getElementById(targetRoute.viewId);
    }

    if (activePanel) {
        activePanel.classList.remove('hidden');
        activePanel.classList.add('block');
    } else if (targetRoute.fallbackUrl) {
        // Clean fallback – no special-case code in the main flow
        window.location.href = targetRoute.fallbackUrl;
        return;
    } else {
        console.warn(`No view found for route: ${finalKey}`);
    }

    // 3. Update navigation UI
    updateNavActiveState(finalKey);

    // 4. History management (pushState with hash fallback)
    const newHash = `#${finalKey}`;
    const title = targetRoute.title || 'VocalWitness';

    try {
        if (replace) {
            window.history.replaceState({ route: finalKey }, title, newHash);
        } else if (window.location.hash !== newHash) {
            window.history.pushState({ route: finalKey }, title, newHash);
        }
    } catch (err) {
        // Extremely old browsers – fall back to classic hash change
        window.location.hash = finalKey;
    }

    // 5. Run route initializer
    if (typeof targetRoute.init === 'function') {
        try {
            await targetRoute.init(activePanel);
        } catch (err) {
            console.error(`Error initializing route ${finalKey}:`, err);
            showToast(`Failed to load ${targetRoute.title}`, "error");
        }
    }
}

/**
 * Initialize the router
 */
export function initRouter() {
    // Handle browser back / forward
    window.addEventListener('popstate', (event) => {
        const routeFromState = event.state?.route;
        const routeFromHash = window.location.hash.slice(1);
        const route = routeFromState || routeFromHash || 'citizen-talk';
        navigateTo(route, { replace: true });
    });

    // Support classic hash changes (fallback)
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.slice(1);
        if (hash && hash !== (history.state?.route || '')) {
            navigateTo(hash, { replace: true });
        }
    });

    // Click handler for any element with data-route
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-route]');
        if (!trigger) return;

        e.preventDefault();
        const routeKey = trigger.getAttribute('data-route');
        navigateTo(routeKey);
    });

    // Initial load
    const initial = window.location.hash.slice(1) || 'citizen-talk';
    navigateTo(initial, { replace: true });
}

// Boot
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouter);
} else {
    initRouter();
}
