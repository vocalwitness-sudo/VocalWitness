// js/router.js - Clean Client-Side Router with pushState + Web Component ready structure
import { showToast } from './utils.js';

// Central view mapping for alias normalization across different naming styles
const VIEW_MAP = {
    'square': 'citizenTalkView',
    'public_square': 'citizenTalkView',
    'public-square': 'citizenTalkView',
    'citizen-talk': 'citizenTalkView',
    'citizen_talk': 'citizenTalkView',
    'witness-voice': 'witnessVoiceView',
    'witness_voice': 'witnessVoiceView',
    'moderation': 'moderationView',
    'profile': 'profileView',
    'audit-log': 'auditLogView',
    'audit_log': 'auditLogView',
    'arena': 'arenaView',
    'quadratic-vote': 'quadraticVoteView',
    'quadratic_vote': 'quadraticVoteView',
    'dao': 'daoView'
};

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
    'dao': {
        viewId: 'daoView',
        title: 'DAO Governance',
        fallbackUrl: 'dao.html',
        init: async (container) => {
            if (!container) return;
            container.innerHTML = `<div class="text-center py-16 text-emerald-400 animate-pulse">Loading DAO Governance...</div>`;
        }
    }
};

// Aliases mapping to standard route keys
const ROUTE_ALIASES = {
    'square': 'citizen-talk',
    'public_square': 'citizen-talk',
    'public-square': 'citizen-talk',
    'citizen_talk': 'citizen-talk',
    'witness_voice': 'witness-voice',
    'audit_log': 'audit-log',
    'quadratic_vote': 'quadratic-vote'
};

/**
 * Normalizes input key using alias mapping defaults
 */
function normalizeRouteKey(rawKey) {
    if (!rawKey) return 'citizen-talk';
    return ROUTE_ALIASES[rawKey] || (ROUTES[rawKey] ? rawKey : 'citizen-talk');
}

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

    // Clean up any views directly referenced in VIEW_MAP
    Object.values(VIEW_MAP).forEach(viewId => {
        const panel = document.getElementById(viewId);
        if (panel) {
            panel.classList.add('hidden');
            panel.classList.remove('block');
        }
    });
}

/**
 * Update active state on navigation elements
 */
function updateNavActiveState(routeKey, rawInputKey) {
    document.querySelectorAll('[data-route]').forEach(navBtn => {
        const routeAttr = navBtn.getAttribute('data-route');
        const isActive = routeAttr === routeKey || routeAttr === rawInputKey;

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
    const finalKey = normalizeRouteKey(routeKey);
    const targetRoute = ROUTES[finalKey];

    // 1. Hide all views
    hideAllViews();

    // 2. Try to show the in-app panel
    let targetViewId = targetRoute.viewId || VIEW_MAP[routeKey] || VIEW_MAP[finalKey];
    let activePanel = targetViewId ? document.getElementById(targetViewId) : null;

    if (activePanel) {
        activePanel.classList.remove('hidden');
        activePanel.classList.add('block');
    } else if (targetRoute.fallbackUrl) {
        window.location.href = targetRoute.fallbackUrl;
        return;
    } else {
        console.warn(`No view found for route: ${finalKey}`);
    }

    // 3. Update navigation UI
    updateNavActiveState(finalKey, routeKey);

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
