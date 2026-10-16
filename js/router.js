/**
 * VocalWitness Client-Side Router
 * Modern hash & pushState router with dynamic module lazy-loading,
 * automatic i18n translation dispatch, and modal-aware back-navigation.
 */

import { showToast } from './utils.js';
import { applyTranslations, t } from './i18n.js';

// Central view mapping — values must match real element IDs in index.html
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
        titleKey: 'nav.citizenTalk',
        defaultTitle: 'Citizen Talk',
        init: async () => {
            const { initFeed } = await import('./feed.js');
            initFeed(undefined, 'citizen-talk');
        }
    },
    'witness-voice': {
        viewId: 'witness',
        titleKey: 'nav.witnessVoice',
        defaultTitle: 'Witness Voice',
        init: async () => {
            const { initFeed } = await import('./feed.js');
            initFeed(undefined, 'witness-voice');
        }
    },
    'moderation': {
        viewId: 'moderationView',
        titleKey: 'nav.moderation',
        defaultTitle: 'Steward Moderation',
        init: async () => {
            const { initModeration } = await import('./moderation.js');
            initModeration();
        }
    },
    'profile': {
        viewId: 'profileModal',
        titleKey: 'nav.profile',
        defaultTitle: 'Witness Profile',
        init: async () => {
            const { initProfile } = await import('./profile.js');
            initProfile?.();
        }
    },
    'audit-log': {
        viewId: 'evidence-ledger',
        titleKey: 'nav.auditLog',
        defaultTitle: 'Forensic Audit Log',
        init: async () => {
            const auditModule = await import('./audit.js').catch(() => null);
            auditModule?.initAuditLog?.();
        }
    },
    'arena': {
        viewId: 'live-arena',
        titleKey: 'nav.liveArena',
        defaultTitle: 'Live Arena',
        init: async () => {
            const container = document.getElementById('live-arena');
            try {
                const { initLiveArena } = await import('./live-arena.js');
                initLiveArena();
            } catch (err) {
                console.error("Failed to load Arena module:", err);
                if (container) {
                    container.innerHTML = `
                        <div class="text-center py-20 text-red-400">
                            Failed to load Live Arena.<br>
                            <span class="text-sm text-zinc-500">${err.message}</span>
                        </div>`;
                }
            }
        }
    },
    'quadratic-vote': {
        viewId: 'quadraticVoteView',
        titleKey: 'nav.quadraticVote',
        defaultTitle: 'Quadratic Voting',
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
        titleKey: 'nav.dao',
        defaultTitle: 'DAO Governance',
        fallbackUrl: 'dao.html',
        init: async (container) => {
            if (!container) return;
            container.innerHTML = `<div class="text-center py-16 text-emerald-400 animate-pulse">Loading DAO Governance...</div>`;
        }
    },
    'mycircle': {
        viewId: 'mycircle',
        titleKey: 'nav.myCircle',
        defaultTitle: 'My Circle',
        init: async () => {
            const circleModule = await import('./circle.js').catch(() => null);
            circleModule?.loadCircle?.();
        }
    },
    'ledger': {
        viewId: 'evidence-ledger',
        titleKey: 'nav.publicRecord',
        defaultTitle: 'Public Record',
        init: async () => {
            // Main initialization handled elsewhere if needed
        }
    }
};

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

function normalizeRouteKey(rawKey) {
    if (!rawKey) return 'citizen-talk';
    return ROUTE_ALIASES[rawKey] || (ROUTES[rawKey] ? rawKey : 'citizen-talk');
}

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
 * Core Navigation Function with i18n & History State Sync
 */
export async function navigateTo(routeKey, { replace = false } = {}) {
    const finalKey = normalizeRouteKey(routeKey);
    const targetRoute = ROUTES[finalKey];

    if (!targetRoute) {
        console.warn(`Unknown route: ${routeKey} → ${finalKey}`);
        return;
    }

    // 1. Hide all view panels
    hideAllViews();

    // 2. Display target panel or follow fallback redirect
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

    // 3. Update active nav styling
    updateNavActiveState(finalKey, routeKey);

    // 4. Resolve and apply localized page title
    const localizedTitle = targetRoute.titleKey ? t(targetRoute.titleKey, targetRoute.defaultTitle) : targetRoute.defaultTitle;
    document.title = `${localizedTitle} • VocalWitness`;

    // 5. History management
    const newHash = `#${finalKey}`;
    try {
        if (replace) {
            window.history.replaceState({ route: finalKey }, localizedTitle, newHash);
        } else if (window.location.hash !== newHash) {
            window.history.pushState({ route: finalKey }, localizedTitle, newHash);
        }
    } catch (err) {
        window.location.hash = finalKey;
    }

    // 6. Run route initializer and ensure translations are applied to newly loaded HTML
    if (typeof targetRoute.init === 'function') {
        try {
            await targetRoute.init(activePanel);
        } catch (err) {
            console.error(`Error initializing route ${finalKey}:`, err);
            showToast(`Failed to load ${localizedTitle}`, "error");
        }
    }

    // 7. Ensure any newly injected markup is fully translated
    if (activePanel) {
        applyTranslations(activePanel);
    }
}

/**
 * Initialize Router Listeners
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
        if (trigger) {
            e.preventDefault();
            const routeKey = trigger.getAttribute('data-route');
            navigateTo(routeKey);
            return;
        }

        const backTrigger = e.target.closest('[data-action="back"]');
        if (backTrigger) {
            e.preventDefault();
            goBack();
        }
    });

    const initial = window.location.hash.slice(1) || 'citizen-talk';
    navigateTo(initial, { replace: true });
}

/**
 * Safe Back Navigation Handler
 */
export function goBack() {
    const openModal = document.querySelector('.fixed.inset-0:not(.hidden)');
    if (openModal) {
        openModal.remove();
        return;
    }

    if (window.history.length > 1) {
        window.history.back();
    } else {
        navigateTo('citizen-talk');
    }
}
