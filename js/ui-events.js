// js/ui-events.js
// -------------------------------------------------
// Central event wiring – no inline handlers
// Dropdowns (More + Notifications) are owned by main.js only
// Auth / Profile are owned by auth.js
// -------------------------------------------------

function on(el, event, handler, options) {
  if (!el) return;
  el.addEventListener(event, handler, options);
}

function openProfileHandler(e) {
  e?.preventDefault?.();
  if (typeof window.openProfile === 'function') {
    window.openProfile();
  } else if (typeof window.openProfileModal === 'function') {
    window.openProfileModal();
  } else {
    window.location.href = '/profile';
  }
}

export function wireIndexPage() {
  if (window.__vwIndexWired) return;
  window.__vwIndexWired = true;

  // ---------- Data Saver ----------
  on(document.getElementById('data-saver-btn'), 'click', () => window.toggleDataSaver?.());
  on(document.getElementById('data-saver-btn-mobile'), 'click', () => window.toggleDataSaver?.());
  on(document.getElementById('footer-data-saver-btn'), 'click', () => window.toggleDataSaver?.());

  // ---------- Support ----------
  // Use one consistent name. Prefer openSupportModal (defined in main.js)
  const openSupport = () => {
    if (typeof window.openSupportModal === 'function') {
      window.openSupportModal();
    } else if (typeof window.openSupportPackagesModal === 'function') {
      window.openSupportPackagesModal();
    }
  };
  on(document.getElementById('openSupportModalBtn'), 'click', openSupport);
  on(document.getElementById('openSupportModalBtnMobile'), 'click', openSupport);
  on(document.getElementById('footerSupportBtn'), 'click', openSupport);

  // ---------- Auth / Profile (safety net – auth.js also handles these via delegation) ----------
  document.querySelectorAll('[data-action="open-auth-modal"]').forEach((btn) => {
    on(btn, 'click', () => window.openAuthModal?.());
  });
  on(document.getElementById('userProfileBtn'), 'click', openProfileHandler);
  on(document.getElementById('userProfileBtnMobile'), 'click', openProfileHandler);

  // ---------- Bookmarks ----------
  document.querySelectorAll('[data-action="open-bookmarks"]').forEach((btn) => {
    on(btn, 'click', () => {
      if (typeof window.openBookmarks === 'function') {
        window.openBookmarks();
      } else if (typeof window.initBookmarksView === 'function') {
        window.initBookmarksView();
      }
    });
  });

  // ---------- Focus banner ----------
  on(document.getElementById('dismiss-focus-banner'), 'click', () => {
    localStorage.setItem('vw_focus_banner_dismissed', '1');
    document.getElementById('focus-banner')?.remove();
  });

  // ---------- Language ----------
  on(document.getElementById('languageSelect'), 'change', (e) => {
    window.changeLanguage?.(e.target.value);
  });
  on(document.getElementById('languageSelectMobile'), 'change', (e) => {
    window.changeLanguage?.(e.target.value);
  });

  // ---------- Feed filter pills ----------
  document.querySelectorAll('.feed-pill[data-filter]').forEach((pill) => {
    on(pill, 'click', () => {
      document.querySelectorAll('.feed-pill').forEach((p) => {
        p.classList.remove('active', 'bg-emerald-500', 'text-black');
      });
      pill.classList.add('active', 'bg-emerald-500', 'text-black');
      window.applyFeedFilter?.(pill.dataset.filter);
    });
  });

  // ---------- Main nav tabs ----------
  // IMPORTANT: use the real function name switchTab (not switchMainTab)
  document.querySelectorAll('.nav-tab[data-tab], #main-nav button[data-tab]').forEach((tab) => {
    on(tab, 'click', (e) => {
      e.preventDefault();
      const tabName = tab.dataset.tab;
      if (tabName && typeof window.switchTab === 'function') {
        window.switchTab(tabName);
      }
    });
  });

  // ========== PUBLIC SQUARE – COMPOSER ==========
  const mainInput = document.getElementById('mainInput');
  const charCount = document.getElementById('char-count');
  if (mainInput && charCount) {
    on(mainInput, 'input', () => {
      charCount.textContent = `${mainInput.value.length} / 2000`;
    });
  }

  on(document.getElementById('btn-photo'), 'click', () => document.getElementById('photoInput')?.click());
  on(document.getElementById('btn-video'), 'click', () => document.getElementById('videoInput')?.click());
  on(document.getElementById('btn-voice'), 'click', () => {
    if (typeof window.startVoiceRecording === 'function') {
      window.startVoiceRecording();
    } else {
      document.getElementById('audioInput')?.click();
    }
  });

  on(document.getElementById('photoInput'), 'change', (e) => window.handleMediaSelect?.(e, 'photo'));
  on(document.getElementById('videoInput'), 'change', (e) => window.handleMediaSelect?.(e, 'video'));
  on(document.getElementById('audioInput'), 'change', (e) => window.handleMediaSelect?.(e, 'audio'));

  on(document.getElementById('rec-pause-btn'), 'click', () => window.pauseRecording?.());
  on(document.getElementById('rec-stop-btn'), 'click', () => window.stopRecording?.());
  on(document.getElementById('rec-replay-btn'), 'click', () => window.replayRecording?.());
  on(document.getElementById('rec-rerecord-btn'), 'click', () => window.rerecordVoice?.());
  on(document.getElementById('verify-voice-btn'), 'click', () => window.verifyVoiceRecording?.());
  on(document.getElementById('postButton'), 'click', () => window.publishTestimony?.());
  on(document.getElementById('feedSortSelect'), 'change', (e) => window.applyFeedSort?.(e.target.value));
  on(document.getElementById('targetFeedSelect'), 'change', (e) => window.setTargetFeed?.(e.target.value));

  // ========== LEDGER ==========
  on(document.getElementById('refreshLedgerBtn'), 'click', () => window.refreshLedger?.());

  // ========== LIVE ARENA ==========
  on(document.getElementById('createRoomBtn'), 'click', () => window.createLiveRoom?.());
  on(document.getElementById('notifyArenaBtn'), 'click', () => window.notifyLiveArena?.());

  // ========== MY CIRCLE ==========
  on(document.getElementById('startPhoneVerificationBtn'), 'click', () => window.startPhoneVerification?.());
  on(document.getElementById('startZKVerificationBtn'), 'click', () => {
    (window.startZKUpgrade || window.startZKVerification)?.();
  });

  document.querySelectorAll('[data-circle-tab]').forEach((btn) => {
    on(btn, 'click', () => {
      document.querySelectorAll('[data-circle-tab]').forEach((b) => {
        b.classList.remove('border-b-2', 'border-emerald-500', 'text-emerald-400');
        b.classList.add('text-zinc-400');
      });
      btn.classList.add('border-b-2', 'border-emerald-500', 'text-emerald-400');
      btn.classList.remove('text-zinc-400');
      window.switchCircleTab?.(btn.dataset.circleTab);
    });
  });

  // ========== TRUSTED VOICES / WITNESS ==========
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

  // ========== SUPPORT MODAL ==========
  on(document.getElementById('closeSupportModal'), 'click', () => window.closeSupportModal?.());

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
  on(document.getElementById('proceedCryptoBtn'), 'click', () => window.startCryptoPayment?.());
  on(document.getElementById('copyUsdtBtn'), 'click', () => window.copyUsdtAddress?.());
  on(document.getElementById('supportModal'), 'click', (e) => {
    if (e.target.id === 'supportModal') window.closeSupportModal?.();
  });

  console.log('[ui-events] wireIndexPage complete (dropdowns left to main.js)');
}

// Auto-run once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireIndexPage);
} else {
  wireIndexPage();
}
