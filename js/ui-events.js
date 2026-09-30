// js/ui-events.js
// -------------------------------------------------
// Central event wiring – no inline handlers
// -------------------------------------------------

function on(el, event, handler, options) {
  if (!el) return;
  el.addEventListener(event, handler, options);
}

function openProfileHandler(e) {
  e?.preventDefault?.();
  if (typeof window.openProfile === 'function') {
    window.openProfile();
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

  // ---------- Notifications ----------
  const notifBtn = document.getElementById('notification-btn');
  const notifBtnMobile = document.getElementById('notification-btn-mobile');

  on(notifBtn, 'click', (e) => {
    e.stopPropagation();
    window.toggleNotificationDropdown?.(e);
  });
  on(notifBtnMobile, 'click', (e) => {
    e.stopPropagation();
    window.toggleNotificationDropdown?.(e);
  });

  document.addEventListener('click', (e) => {
    const desktop = document.getElementById('notification-dropdown');
    if (desktop && !desktop.contains(e.target) && !notifBtn?.contains(e.target)) {
      desktop.classList.add('hidden');
    }
  });

  // ---------- Support ----------
  on(document.getElementById('openSupportModalBtn'), 'click', () => window.openSupportPackagesModal?.());
  on(document.getElementById('openSupportModalBtnMobile'), 'click', () => window.openSupportPackagesModal?.());
  on(document.getElementById('footerSupportBtn'), 'click', () => window.openSupportPackagesModal?.());
  on(document.getElementById('footer-data-saver-btn'), 'click', () => window.toggleDataSaver?.());

  // ---------- Auth / Profile ----------
  document.querySelectorAll('[data-action="open-auth-modal"]').forEach((btn) => {
    on(btn, 'click', () => window.openAuthModal?.());
  });
  on(document.getElementById('userProfileBtn'), 'click', openProfileHandler);
  on(document.getElementById('userProfileBtnMobile'), 'click', openProfileHandler);

  // ---------- Bookmarks ----------
  document.querySelectorAll('[data-action="open-bookmarks"]').forEach((btn) => {
    on(btn, 'click', () => window.openBookmarks?.());
  });

  // ---------- Focus banner ----------
  on(document.getElementById('dismiss-focus-banner'), 'click', () => {
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
      document.querySelectorAll('.feed-pill').forEach((p) => p.classList.remove('active', 'bg-emerald-500', 'text-black'));
      pill.classList.add('active', 'bg-emerald-500', 'text-black');
      window.applyFeedFilter?.(pill.dataset.filter);
    });
  });

  // ---------- Main nav tabs ----------
  document.querySelectorAll('.nav-tab[data-tab]').forEach((tab) => {
    on(tab, 'click', () => {
      document.querySelectorAll('.nav-tab').forEach((t) => {
        t.classList.remove('active', 'bg-emerald-500', 'text-black', 'border-emerald-400/50');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active', 'bg-emerald-500', 'text-black', 'border-emerald-400/50');
      tab.setAttribute('aria-selected', 'true');
      window.switchMainTab?.(tab.dataset.tab);
    });
  });

  // ---------- More menu ----------
  const moreBtn = document.getElementById('more-btn');
  const moreMenu = document.getElementById('more-menu');
  if (moreBtn && moreMenu) {
    on(moreBtn, 'click', (e) => {
      e.stopPropagation();
      const isOpen = !moreMenu.classList.contains('hidden');
      moreMenu.classList.toggle('hidden', isOpen);
      moreBtn.setAttribute('aria-expanded', String(!isOpen));
    });
    document.addEventListener('click', () => {
      moreMenu.classList.add('hidden');
      moreBtn.setAttribute('aria-expanded', 'false');
    });
  }

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
  on(document.getElementById('verify-voice-btn'), 'click', () => window.verifyVoiceRecording?.());
  on(document.getElementById('postButton'), 'click', () => window.publishTestimony?.());
  on(document.getElementById('feedSortSelect'), 'change', (e) => window.applyFeedSort?.(e.target.value));
  on(document.getElementById('targetFeedSelect'), 'change', (e) => window.setTargetFeed?.(e.target.value));

  // ========== LEDGER ==========
  on(document.getElementById('refreshLedgerBtn'), 'click', () => window.refreshLedger?.());

  // ========== LIVE ARENA ==========
  on(document.getElementById('notifyArenaBtn'), 'click', () => window.notifyLiveArena?.());

  // ========== MY CIRCLE ==========
  on(document.getElementById('startPhoneVerificationBtn'), 'click', () => window.startPhoneVerification?.());
  on(document.getElementById('startZKVerificationBtn'), 'click', () => {
    window.startZKUpgrade?.() || window.startZKVerification?.();
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

  // ========== TRUSTED VOICES ==========
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
  on(document.getElementById('paystackPayBtn'), 'click', () => window.startPaystackPayment?.());
  on(document.getElementById('proceedCryptoBtn'), 'click', () => window.startCryptoPayment?.());
  on(document.getElementById('copyUsdtBtn'), 'click', () => window.copyUsdtAddress?.());
  on(document.getElementById('supportModal'), 'click', (e) => {
    if (e.target.id === 'supportModal') window.closeSupportModal?.();
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireIndexPage);
} else {
  wireIndexPage();
}
