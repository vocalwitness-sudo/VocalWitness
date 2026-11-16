// js/ui-events.js
// -------------------------------------------------
// Index page helpers only — single-run wiring
//
// OWNED ELSEWHERE (do not wire here):
//   • Data Saver          → main.js (initDataSaver)
//   • Main nav tabs       → main.js (wireTabButtons)
//   • More / Notifications dropdowns → main.js (createDropdown)
//   • Auth / Profile      → auth.js
//   • Live Voice / photo / video / publish → media.js + composer.js
//   • Arena #createRoomBtn → live-arena.js
//   • Language desktop↔mobile sync → ui.js (initLanguageSync) preferred;
//     we only call changeLanguage if ui.js did not mark lang wired
//
// Called once from main.js bootstrap → wireIndexPage()
// -------------------------------------------------

function on(el, event, handler, options) {
  if (!el) return;
  if (el.dataset && event === 'click' && el.dataset.vwClickWired === '1') return;
  if (el.dataset && event === 'click') el.dataset.vwClickWired = '1';
  el.addEventListener(event, handler, options);
}

/**
 * Wire non-core controls on the home index shell.
 * Safe to call multiple times (idempotent).
 */
export function wireIndexPage() {
  if (window.__vwIndexWired) {
    console.log('[ui-events] wireIndexPage already done — skip');
    return;
  }
  window.__vwIndexWired = true;

  // ---------- Support open (header / footer) ----------
  // main.js defines window.openSupportModal. We own these button ids once.
  // main.js setupEventListeners must NOT also open support on these same ids.
  const openSupport = (e) => {
    e?.preventDefault?.();
    if (typeof window.openSupportModal === 'function') {
      window.openSupportModal();
    } else if (typeof window.openSupportPackagesModal === 'function') {
      window.openSupportPackagesModal();
    }
  };
  on(document.getElementById('openSupportModalBtn'), 'click', openSupport);
  on(document.getElementById('openSupportModalBtnMobile'), 'click', openSupport);
  on(document.getElementById('footerSupportBtn'), 'click', openSupport);

  // ---------- Bookmarks ----------
  document.querySelectorAll('[data-action="open-bookmarks"]').forEach((btn) => {
    on(btn, 'click', (e) => {
      e?.preventDefault?.();
      if (typeof window.openBookmarks === 'function') {
        window.openBookmarks();
      } else if (typeof window.initBookmarksView === 'function') {
        window.initBookmarksView();
      }
    });
  });

  // ---------- Focus banner dismiss (backup; main may also dismiss) ----------
  on(document.getElementById('dismiss-focus-banner'), 'click', () => {
    localStorage.setItem('vw_focus_banner_dismissed', '1');
    document.getElementById('focus-banner')?.remove();
  });

  // ---------- Language (only if ui.js has not claimed it) ----------
  if (!window.__vwLangWired) {
    const onLang = (e) => {
      const lang = e.target?.value;
      if (!lang) return;
      if (typeof window.changeLanguage === 'function') {
        window.changeLanguage(lang);
      }
    };
    on(document.getElementById('languageSelect'), 'change', onLang);
    on(document.getElementById('languageSelectMobile'), 'change', onLang);
  }

  // ---------- Legacy feed pills (static HTML). Dynamic filters live in feed.js ----------
  document.querySelectorAll('.feed-pill[data-filter]').forEach((pill) => {
    on(pill, 'click', () => {
      document.querySelectorAll('.feed-pill').forEach((p) => {
        p.classList.remove('active', 'bg-emerald-500', 'text-black');
      });
      pill.classList.add('active', 'bg-emerald-500', 'text-black');
      window.applyFeedFilter?.(pill.dataset.filter);
    });
  });

  // ---------- Composer helpers (not publish / media) ----------
  const mainInput = document.getElementById('mainInput');
  const charCount = document.getElementById('char-count');
  if (mainInput && charCount && mainInput.dataset.charCountWired !== '1') {
    mainInput.dataset.charCountWired = '1';
    mainInput.addEventListener('input', () => {
      charCount.textContent = `${mainInput.value.length} / 3000`;
    });
  }

  on(document.getElementById('feedSortSelect'), 'change', (e) => {
    const v = e.target?.value;
    if (typeof window.applyFeedSort === 'function') {
      window.applyFeedSort(v);
    } else {
      window.dispatchEvent(
        new CustomEvent('feed-set-sort', { detail: { sort: v } })
      );
    }
  });

  on(document.getElementById('targetFeedSelect'), 'change', (e) => {
    window.setTargetFeed?.(e.target.value);
  });

  // ========== LEDGER ==========
  on(document.getElementById('refreshLedgerBtn'), 'click', () => {
    window.refreshLedger?.();
  });

  // ========== LIVE ARENA ==========
  // #createRoomBtn is owned by live-arena.js — do not wire here.
  on(document.getElementById('notifyArenaBtn'), 'click', () => {
    window.notifyLiveArena?.();
  });

  // ========== MY CIRCLE ==========
  on(document.getElementById('startPhoneVerificationBtn'), 'click', () => {
    window.startPhoneVerification?.();
  });
  on(document.getElementById('startZKVerificationBtn'), 'click', () => {
    (window.startZKUpgrade || window.startZKVerification)?.();
  });

  document.querySelectorAll('[data-circle-tab]').forEach((btn) => {
    on(btn, 'click', () => {
      document.querySelectorAll('[data-circle-tab]').forEach((b) => {
        b.classList.remove('border-b-2', 'border-emerald-500', 'text-emerald-400');
        b.classList.add('text-zinc-400');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('border-b-2', 'border-emerald-500', 'text-emerald-400');
      btn.classList.remove('text-zinc-400');
      btn.setAttribute('aria-selected', 'true');
      window.switchCircleTab?.(btn.dataset.circleTab);
    });
  });

  // ========== WITNESS (legacy filter strip if present) ==========
  on(document.getElementById('witness-search'), 'input', (e) => {
    window.filterTrustedVoices?.(e.target.value);
  });

  document.querySelectorAll('#witness-filters [data-filter]').forEach((btn) => {
    on(btn, 'click', () => {
      document.querySelectorAll('#witness-filters [data-filter]').forEach((b) => {
        b.classList.remove('border-amber-500/40', 'bg-amber-500/20', 'text-amber-400');
        b.classList.add('border-zinc-700', 'bg-zinc-800', 'text-zinc-300');
      });
      btn.classList.add('border-amber-500/40', 'bg-amber-500/20', 'text-amber-400');
      btn.classList.remove('border-zinc-700', 'bg-zinc-800', 'text-zinc-300');
      window.applyWitnessFilter?.(btn.dataset.filter);
    });
  });

  // ========== SUPPORT MODAL (inner controls) ==========
  on(document.getElementById('closeSupportModal'), 'click', () => {
    window.closeSupportModal?.();
  });

  document.querySelectorAll('.support-tier-btn').forEach((btn) => {
    on(btn, 'click', () => {
      document.querySelectorAll('.support-tier-btn').forEach((b) => {
        b.classList.remove('active-tier', 'border-emerald-500', 'bg-emerald-600/20');
      });
      btn.classList.add('active-tier', 'border-emerald-500', 'bg-emerald-600/20');
      const amount = btn.dataset.amount;
      const customInput = document.getElementById('customSupportAmount');
      if (customInput) customInput.value = amount;
      window.setSupportAmount?.(Number(amount));
    });
  });

  on(document.getElementById('customSupportAmount'), 'input', (e) => {
    window.setSupportAmount?.(Number(e.target.value) || 0);
  });

  on(document.getElementById('paystackPayBtn'), 'click', () => {
    if (typeof window.initiatePayment === 'function') {
      const amountInput = document.getElementById('customSupportAmount');
      const amount = amountInput ? parseFloat(amountInput.value) || 15 : 15;
      window.initiatePayment(amount);
    } else {
      window.startPaystackPayment?.();
    }
  });

  on(document.getElementById('proceedCryptoBtn'), 'click', () => {
    window.startCryptoPayment?.();
  });
  on(document.getElementById('copyUsdtBtn'), 'click', () => {
    window.copyUsdtAddress?.();
  });

  on(document.getElementById('supportModal'), 'click', (e) => {
    if (e.target.id === 'supportModal') window.closeSupportModal?.();
  });

  console.log(
    '[ui-events] wireIndexPage complete (auth/nav/data-saver/arena-create left to owners)'
  );
}

// Do NOT auto-run on DOMContentLoaded.
// main.js bootstrap is the single caller → avoids double wiring on slow phones.
