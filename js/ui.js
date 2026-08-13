// js/ui.js - Global UI & Auth State Manager
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { auth } from './firebase-config.js';
import { refreshTierAndUI } from './tier.js';

/**
 * Initialize button active/select indicator state management
 */
function setupButtonIndicators() {
    document.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('.filter-chip, .tab-btn, .nav-btn, .tier-filter-btn');
        if (!targetBtn) return;

        // Scope the toggle within its container or navigation parent
        const container = targetBtn.parentElement;
        if (container) {
            container.querySelectorAll('.active, [aria-selected="true"]').forEach(el => {
                el.classList.remove('active');
                el.setAttribute('aria-selected', 'false');
            });
        }

        // Apply active states to the target button
        targetBtn.classList.add('active');
        targetBtn.setAttribute('aria-selected', 'true');
    });
}

/* ==========================================================================
   BATCH 1: DUAL UI & LANGUAGE ENGINE FUNCTIONS
   ========================================================================== */

/**
 * 1. Synchronize Desktop and Mobile Language Selectors
 */
function initLanguageSync() {
    const desktopSelect = document.getElementById('languageSelector-desktop');
    const mobileSelect = document.getElementById('languageSelector-mobile');

    // Retrieve initial language or default to 'en'
    const savedLang = localStorage.getItem('vw_lang') || 'en';

    // Apply saved language to both DOM nodes
    if (desktopSelect) desktopSelect.value = savedLang;
    if (mobileSelect) mobileSelect.value = savedLang;

    // Helper to update both dropdowns and trigger translations
    function handleLangChange(newLang) {
        localStorage.setItem('vw_lang', newLang);

        if (desktopSelect) desktopSelect.value = newLang;
        if (mobileSelect) mobileSelect.value = newLang;

        // Trigger i18n engine update if window.changeLanguage or custom event exists
        if (typeof window.changeLanguage === 'function') {
            window.changeLanguage(newLang);
        } else {
            window.dispatchEvent(new CustomEvent('vw:languageChange', { detail: { lang: newLang } }));
        }
    }

    // Attach listeners
    if (desktopSelect) {
        desktopSelect.addEventListener('change', (e) => handleLangChange(e.target.value));
    }
    if (mobileSelect) {
        mobileSelect.addEventListener('change', (e) => handleLangChange(e.target.value));
    }
}

/**
 * 2. Synchronize Desktop and Mobile Drawer Data Saver Toggles
 */
function initDataSaverSync() {
    const desktopBtn = document.getElementById('data-saver-btn');
    const drawerBtn = document.getElementById('data-saver-btn-drawer');
    const desktopStatus = document.getElementById('data-saver-status');
    const drawerStatus = document.getElementById('data-saver-status-drawer');

    // Read initial state
    let isDataSaver = localStorage.getItem('vw_datasaver') === 'true';

    function updateDataSaverUI(enabled) {
        const text = enabled ? 'On' : 'Off';
        const color = enabled ? '#10b981' : '#34d399'; // Emerald highlights

        if (desktopStatus) {
            desktopStatus.textContent = text;
            desktopStatus.style.color = color;
        }
        if (drawerStatus) {
            drawerStatus.textContent = text;
            drawerStatus.style.color = color;
        }

        // Apply global body class for media compression / data saver triggers
        document.body.classList.toggle('data-saver-active', enabled);
    }

    // Apply initial state to UI
    updateDataSaverUI(isDataSaver);

    function toggleDataSaver() {
        isDataSaver = !isDataSaver;
        localStorage.setItem('vw_datasaver', isDataSaver.toString());
        updateDataSaverUI(isDataSaver);

        window.dispatchEvent(new CustomEvent('vw:dataSaverToggle', { detail: { enabled: isDataSaver } }));
    }

    if (desktopBtn) desktopBtn.addEventListener('click', toggleDataSaver);
    if (drawerBtn) drawerBtn.addEventListener('click', toggleDataSaver);
}

/**
 * 3. Mobile Overlay Drawer Management (☰)
 */
function initMobileDrawer() {
    const drawer = document.getElementById('mobile-drawer');
    const toggleBtn = document.getElementById('mobile-menu-toggle-btn');

    if (!drawer) return;

    // Toggle drawer visibility
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            drawer.classList.toggle('hidden');
        });
    }

    // Close when clicking backdrop area
    drawer.addEventListener('click', (e) => {
        if (e.target === drawer) {
            drawer.classList.add('hidden');
        }
    });

    // Close on Escape key press
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !drawer.classList.contains('hidden')) {
            drawer.classList.add('hidden');
        }
    });
}

/**
 * Initialize core UI state & listen for Auth changes
 */
export function initUI() {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log("👤 User authenticated:", user.uid);
        } else {
            console.log("👤 Guest mode / Unauthenticated");
        }
        // Refresh tier themes and badge elements whenever auth state resolves
        refreshTierAndUI();
    });

    // Initialize button selection behavior
    setupButtonIndicators();

    // Initialize Batch 1 Dual UI Controls
    initLanguageSync();
    initDataSaverSync();
    initMobileDrawer();
}

// Auto-run UI setup on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
} else {
    initUI();
}
