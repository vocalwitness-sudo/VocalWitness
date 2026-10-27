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
   BATCH 1: DUAL UI — Language + Data Saver (IDs match index.html)
   ========================================================================== */

/**
 * 1. Synchronize Desktop and Mobile Language Selectors
 *    Real IDs: languageSelect / languageSelectMobile
 */
function initLanguageSync() {
  const desktopSelect = document.getElementById('languageSelect');
  const mobileSelect  = document.getElementById('languageSelectMobile');

  const savedLang = localStorage.getItem('vw_lang') || 'en';

  if (desktopSelect) desktopSelect.value = savedLang;
  if (mobileSelect)  mobileSelect.value  = savedLang;

  function handleLangChange(newLang) {
    localStorage.setItem('vw_lang', newLang);
    if (desktopSelect) desktopSelect.value = newLang;
    if (mobileSelect)  mobileSelect.value  = newLang;

    if (typeof window.changeLanguage === 'function') {
      window.changeLanguage(newLang);
    } else {
      window.dispatchEvent(new CustomEvent('vw:languageChange', {
        detail: { lang: newLang }
      }));
    }
  }

  if (desktopSelect) {
    desktopSelect.addEventListener('change', (e) => handleLangChange(e.target.value));
  }
  if (mobileSelect) {
    mobileSelect.addEventListener('change', (e) => handleLangChange(e.target.value));
  }
}

/**
 * 2. Synchronize Desktop and Mobile Data Saver
 *    Real IDs: data-saver-btn / data-saver-btn-mobile
 *              data-saver-status / data-saver-status-mobile
 *
 * main.js owns Data Saver when window.toggleDataSaver exists.
 * This is only a fallback if main.js has not loaded yet.
 * Storage key MUST match main.js: vw_data_saver
 */
function initDataSaverSync() {
  // If main.js already owns Data Saver, skip to avoid double-toggles
  if (typeof window.toggleDataSaver === 'function') {
    console.log('[ui.js] Data Saver owned by main.js — skipping local wiring');
    return;
  }

  const desktopBtn    = document.getElementById('data-saver-btn');
  const mobileBtn     = document.getElementById('data-saver-btn-mobile');
  const desktopStatus = document.getElementById('data-saver-status');
  const mobileStatus  = document.getElementById('data-saver-status-mobile');

  // Same key as main.js (was vw_datasaver — that caused desync)
  const DATA_SAVER_KEY = 'vw_data_saver';
  let isDataSaver = localStorage.getItem(DATA_SAVER_KEY) === 'true';

  function updateDataSaverUI(enabled) {
    const text = enabled ? 'On' : 'Off';

    if (desktopStatus) desktopStatus.textContent = text;
    if (mobileStatus)  mobileStatus.textContent  = text;

    [desktopBtn, mobileBtn].forEach((btn) => {
      if (!btn) return;
      btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      btn.dataset.active = enabled ? 'true' : 'false';
    });

    document.body.classList.toggle('data-saver-active', enabled);
  }

  updateDataSaverUI(isDataSaver);

  function toggleDataSaver() {
    isDataSaver = !isDataSaver;
    localStorage.setItem(DATA_SAVER_KEY, String(isDataSaver));
    updateDataSaverUI(isDataSaver);
    window.dispatchEvent(new CustomEvent('data-saver-changed', {
      detail: { enabled: isDataSaver }
    }));
  }

  if (desktopBtn) desktopBtn.addEventListener('click', toggleDataSaver);
  if (mobileBtn)  mobileBtn.addEventListener('click', toggleDataSaver);
}

/**
 * 3. Mobile drawer — current index.html has no drawer.
 *    Keep a no-op so older call sites don’t break.
 */
function initMobileDrawer() {
  // No #mobile-drawer in current index.html — dual header is used instead.
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
