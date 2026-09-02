// js/router.js - Clean Client-Side Router with pushState + Web Component ready structure
import { showToast } from './utils.js';

// Central view mapping — values must match real element ids in index.html
const VIEW_MAP = {
    'square': 'public-square',
    'public_square': 'public-square',
    'public-square': 'public-square',
    'citizen-talk': 'public-square',
    'citizen_talk': 'public-square',
    'witness-voice': 'witness',
    'witness_voice': 'witness',
    'moderation': 'moderationView',
    'profile': 'profileModal',
    'audit-log': 'evidence-ledger',
    'audit_log': 'evidence-ledger',
    'arena': 'live-arena',
    'quadratic-vote': 'quadraticVoteView',
    'quadratic_vote': 'quadraticVoteView',
    'dao': 'daoView',
    'mycircle': 'mycircle',
    'ledger': 'evidence-ledger'
};

const ROUTES = {
    'citizen-talk': {
        viewId: 'public-square',
        title: 'Citizen Talk',
        init: async () => {
            const { initFeed } = await import('./feed.js');
            initFeed(undefined, 'citizen-talk');
        }
    },
    'witness-voice': {
        viewId: 'witness',
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
        viewId: 'profileModal',
        title: 'Witness Profile',
        init: async () => {
            const { initProfile } = await import('./profile.js');
            initProfile?.();
        }
    },
    'audit-log': {
        viewId: 'evidence-ledger',
        title: 'Forensic Audit Log',
        init: async () => {
            const auditModule = await import('./audit.js').catch(() => null);
            auditModule?.initAuditLog?.();
        }
    },
    'arena': {
        viewId: 'live-arena',
        title: 'Live Arena',
        init: async () => {
            const container = document.getElementById('live-arena');
            if (container) {
                // Don't wipe the whole panel if main.js already owns it
                const slot = container.querySelector('[data-arena-root]') || container;
                if (!container.querySelector('[data-arena-initialized]')) {
                    // optional loading hint only if empty
                }
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
    },
    'mycircle': {
        viewId: 'mycircle',
        title: 'My Circle',
        init: async () => {
            const circleModule = await import('./circle.js').catch(() => null);
            circleModule?.loadCircle?.();
        }
    },
    'ledger': {
        viewId: 'evidence-ledger',
        title: 'Public Record',
        init: async () => {
            // main.js also loads ledger; safe no-op if already active
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
    'quadratic_vote': 'quadratic-vote',
    'my-circle': 'mycircle',
    'my_circle': 'mycircle',
    'public-record': 'ledger',
    'public_record': 'ledger'
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
    const ids = new Set([
        ...Object.values(ROUTES).map(r => r.viewId).filter(Boolean),
        ...Object.values(VIEW_MAP)
    ]);
    ids.forEach(viewId => {
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

    if (!targetRoute) {
        console.warn(`Unknown route: ${routeKey} → ${finalKey}`);
        return;
    }

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
        console.warn(`No view found for route: ${finalKey} (expected #${targetViewId})`);
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
    window.addEventListener('popstate', (event) => {
        const routeFromState = event.state?.route;
        const routeFromHash = window.location.hash.slice(1);
        const route = routeFromState || routeFromHash || 'citizen-talk';
        navigateTo(route, { replace: true });
    });

    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.slice(1);
        if (hash && hash !== (history.state?.route || '')) {
            navigateTo(hash, { replace: true });
        }
    });

    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-route]');
        if (!trigger) return;
        e.preventDefault();
        const routeKey = trigger.getAttribute('data-route');
        navigateTo(routeKey);
    });

    const initial = window.location.hash.slice(1) || 'citizen-talk';
    navigateTo(initial, { replace: true });
}

/**
 * Safe back navigation handler
 */
export function goBack() {
    // 1. If any modal or drawer is open, close it first instead of changing routes
    const openModal = document.querySelector('.fixed.inset-0:not(.hidden)');
    if (openModal) {
        openModal.remove();
        return;
    }

    // 2. If there's history within the app session, step back
    if (window.history.length > 1) {
        window.history.back();
    } else {
        // 3. Default fallback if history is exhausted
        navigateTo('citizen-talk');
    }
}

// Boot
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouter);
} else {
    initRouter();
}
