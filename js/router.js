// js/router.js - Dynamic Client-Side Router for VocalWitness
import { initFeed } from './feed.js';
import { initModeration } from './moderation.js';
import { showToast } from './utils.js';

const ROUTES = {
    'citizen-talk': { viewId: 'citizenTalkView', title: 'Citizen Talk', init: () => initFeed(undefined, 'citizen-talk') },
    'witness-voice': { viewId: 'witnessVoiceView', title: 'Witness Voice', init: () => initFeed(undefined, 'witness-voice') },
    'moderation': { viewId: 'moderationView', title: 'Steward Moderation', init: () => initModeration() },
    'profile': { viewId: 'profileView', title: 'Witness Profile' },
    'audit-log': { viewId: 'auditLogView', title: 'Forensic Audit Log' }
};

/**
 * Navigates to a specific route view
 * @param {string} routeKey - Route matching key from ROUTES
 */
export function navigateTo(routeKey) {
    const targetRoute = ROUTES[routeKey] || ROUTES['citizen-talk'];

    // Hide all view panels
    Object.values(ROUTES).forEach(route => {
        const panel = document.getElementById(route.viewId);
        if (panel) {
            panel.classList.add('hidden');
            panel.classList.remove('block');
        }
    });

    // Show selected panel
    const activePanel = document.getElementById(targetRoute.viewId);
    if (activePanel) {
        activePanel.classList.remove('hidden');
        activePanel.classList.add('block');
    } else {
        console.warn(`Panel ID #${targetRoute.viewId} not found in DOM.`);
    }

    // Update nav element active states
    document.querySelectorAll('[data-route]').forEach(navBtn => {
        const routeAttr = navBtn.getAttribute('data-route');
        if (routeAttr === routeKey) {
            navBtn.classList.add('bg-zinc-800', 'text-emerald-400');
            navBtn.classList.remove('text-zinc-400');
        } else {
            navBtn.classList.remove('bg-zinc-800', 'text-emerald-400');
            navBtn.classList.add('text-zinc-400');
        }
    });

    // Update URL hash without forcing reload
    if (window.location.hash.slice(1) !== routeKey) {
        window.history.pushState(null, targetRoute.title, `#${routeKey}`);
    }

    // Trigger optional module initialization
    if (typeof targetRoute.init === 'function') {
        try {
            targetRoute.init();
        } catch (err) {
            console.error(`Error initializing route ${routeKey}:`, err);
        }
    }
}

/**
 * Initializes hash routing and event listeners
 */
export function initRouter() {
    // Listen to hash changes in browser history
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.slice(1);
        if (hash) navigateTo(hash);
    });

    // Global click listener for elements with data-route
    document.addEventListener('click', (e) => {
        const trigger = e.target.closest('[data-route]');
        if (trigger) {
            e.preventDefault();
            const routeKey = trigger.getAttribute('data-route');
            navigateTo(routeKey);
        }
    });

    // Boot route selection
    const initialHash = window.location.hash.slice(1);
    navigateTo(initialHash || 'citizen-talk');
}

// Automatic setup on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRouter);
} else {
    initRouter();
}
