// js/ui.js - Global UI & Auth State Manager
// Batch 4: language owned here once; Data Saver owned only by main.js

import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { auth } from './firebase-config.js';
import { refreshTierAndUI } from './tier.js';

/**
 * Button active/select indicator (scoped to chip/tab groups only)
 */
function setupButtonIndicators() {
  document.addEventListener('click', (e) => {
    const targetBtn = e.target.closest('.filter-chip, .tab-btn, .nav-btn, .tier-filter-btn');
    if (!targetBtn) return;

    // Do not fight main nav tabs (#main-nav [data-tab]) — main.js owns those
    if (targetBtn.closest('#main-nav')) return;

    const container = targetBtn.parentElement;
    if (container) {
      container.querySelectorAll('.active, [aria-selected="true"]').forEach((el) => {
        el.classList.remove('active');
        el.setAttribute('aria-selected', 'false');
      });
    }

    targetBtn.classList.add('active');
    targetBtn.setAttribute('aria-selected', 'true');
  });
}

/**
 * Desktop + mobile language selectors — sole owner when __vwLangWired is set
 */
function initLanguageSync() {
  if (window.__vwLangWired) return;
  window.__vwLangWired = true;

  const desktopSelect = document.getElementById('languageSelect');
  const mobileSelect = document.getElementById('languageSelectMobile');

  const savedLang = localStorage.getItem('vw_lang') || 'en';

  if (desktopSelect) desktopSelect.value = savedLang;
  if (mobileSelect) mobileSelect.value = savedLang;

  function handleLangChange(newLang) {
    localStorage.setItem('vw_lang', newLang);
    if (desktopSelect) desktopSelect.value = newLang;
    if (mobileSelect) mobileSelect.value = newLang;

    if (typeof window.changeLanguage === 'function') {
      window.changeLanguage(newLang);
    } else {
      window.dispatchEvent(
        new CustomEvent('vw:languageChange', { detail: { lang: newLang } })
      );
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
 * Data Saver — NEVER wire here. main.js initDataSaver is sole owner.
 */
function initDataSaverSync() {
  return;
}

function initMobileDrawer() {
  // No drawer in current index.html
}

export function initUI() {
  onAuthStateChanged(auth, (user) => {
    if (user) {
      console.log('👤 User authenticated:', user.uid);
    } else {
      console.log('👤 Guest mode / Unauthenticated');
    }
    refreshTierAndUI();
  });

  setupButtonIndicators();
  initLanguageSync();
  initDataSaverSync();
  initMobileDrawer();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initUI);
} else {
  initUI();
}
