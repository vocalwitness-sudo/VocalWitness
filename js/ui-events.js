// js/ui-events.js
// -------------------------------------------------
// Central event wiring – no inline handlers
// -------------------------------------------------

export function wireIndexPage() {
  // ---------- Data Saver ----------
  const dataSaverBtn = document.getElementById('data-saver-btn');
  const dataSaverBtnMobile = document.getElementById('data-saver-btn-mobile');

  if (dataSaverBtn) dataSaverBtn.addEventListener('click', toggleDataSaver);
  if (dataSaverBtnMobile) dataSaverBtnMobile.addEventListener('click', toggleDataSaver);

  // ---------- Notifications (desktop + mobile) ----------
  const notifBtn = document.getElementById('notification-btn');
  const notifBtnMobile = document.getElementById('notification-btn-mobile');

  if (notifBtn) {
    notifBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNotificationDropdown(e);
    });
  }
  if (notifBtnMobile) {
    notifBtnMobile.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNotificationDropdown(e);
    });
  }

  // Close dropdown when clicking outside
  document.addEventListener('click', (e) => {
    const desktop = document.getElementById('notification-dropdown');
    const mobileContainer = document.getElementById('notification-container-mobile');
    if (desktop && !desktop.contains(e.target) && !notifBtn?.contains(e.target)) {
      desktop.classList.add('hidden');
    }
  });

  // ---------- Support buttons ----------
  document.getElementById('openSupportModalBtn')
    ?.addEventListener('click', () => window.openSupportPackagesModal?.());
  document.getElementById('openSupportModalBtnMobile')
    ?.addEventListener('click', () => window.openSupportPackagesModal?.());

  // ---------- Auth / Profile ----------
  document.querySelectorAll('[data-action="open-auth-modal"]').forEach(btn => {
    btn.addEventListener('click', () => window.openAuthModal?.());
  });

  document.getElementById('userProfileBtn')
    ?.addEventListener('click', () => window.openProfile?.() || (window.location.href = '/profile'));
  document.getElementById('userProfileBtnMobile')
    ?.addEventListener('click', () => window.openProfile?.() || (window.location.href = '/profile'));

  // ---------- Bookmarks ----------
  document.querySelectorAll('[data-action="open-bookmarks"]').forEach(btn => {
    btn.addEventListener('click', () => window.openBookmarks?.());
  });

  // ---------- Focus banner dismiss ----------
  document.getElementById('dismiss-focus-banner')
    ?.addEventListener('click', () => {
      document.getElementById('focus-banner')?.remove();
    });

  // ---------- Language selects ----------
  const langSelect = document.getElementById('languageSelect');
  const langSelectMobile = document.getElementById('languageSelectMobile');

  if (langSelect) {
    langSelect.addEventListener('change', (e) => window.changeLanguage?.(e.target.value));
  }
  if (langSelectMobile) {
    langSelectMobile.addEventListener('change', (e) => window.changeLanguage?.(e.target.value));
  }

  // ---------- Feed filter pills ----------
  document.querySelectorAll('.feed-pill[data-filter]').forEach(pill => {
    pill.addEventListener('click', () => {
      const filter = pill.dataset.filter;
      document.querySelectorAll('.feed-pill').forEach(p => p.classList.remove('active', 'bg-emerald-500', 'text-black'));
      pill.classList.add('active', 'bg-emerald-500', 'text-black');
      window.applyFeedFilter?.(filter);
    });
  });

  // ---------- Main navigation tabs ----------
  document.querySelectorAll('.nav-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.remove('active', 'bg-emerald-500', 'text-black', 'border-emerald-400/50');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active', 'bg-emerald-500', 'text-black', 'border-emerald-400/50');
      tab.setAttribute('aria-selected', 'true');

      window.switchMainTab?.(target);
    });
  });

  // ---------- More menu ----------
  const moreBtn = document.getElementById('more-btn');
  const moreMenu = document.getElementById('more-menu');

  if (moreBtn && moreMenu) {
    moreBtn.addEventListener('click', (e) => {
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

  // ========== 1. PUBLIC SQUARE – COMPOSER ==========
  const mainInput = document.getElementById('mainInput');
  const charCount = document.getElementById('char-count');
  if (mainInput && charCount) {
    mainInput.addEventListener('input', () => {
      charCount.textContent = `${mainInput.value.length} / 2000`;
    });
  }

  document.getElementById('btn-photo')?.addEventListener('click', () => {
    document.getElementById('photoInput')?.click();
  });
  document.getElementById('btn-video')?.addEventListener('click', () => {
    document.getElementById('videoInput')?.click();
  });
  document.getElementById('btn-voice')?.addEventListener('click', () => {
    if (typeof window.startVoiceRecording === 'function') {
      window.startVoiceRecording();
    } else {
      document.getElementById('audioInput')?.click();
    }
  });

  document.getElementById('photoInput')?.addEventListener('change', (e) => {
    window.handleMediaSelect?.(e, 'photo');
  });
  document.getElementById('videoInput')?.addEventListener('change', (e) => {
    window.handleMediaSelect?.(e, 'video');
  });
  document.getElementById('audioInput')?.addEventListener('change', (e) => {
    window.handleMediaSelect?.(e, 'audio');
  });

  document.getElementById('rec-pause-btn')?.addEventListener('click', () => window.pauseRecording?.());
  document.getElementById('rec-stop-btn')?.addEventListener('click', () => window.stopRecording?.());
  document.getElementById('rec-replay-btn')?.addEventListener('click', () => window.replayRecording?.());
  document.getElementById('verify-voice-btn')?.addEventListener('click', () => window.verifyVoiceRecording?.());

  document.getElementById('postButton')?.addEventListener('click', () => {
    window.publishTestimony?.();
  });

  document.getElementById('feedSortSelect')?.addEventListener('change', (e) => {
    window.applyFeedSort?.(e.target.value);
  });

  document.getElementById('targetFeedSelect')?.addEventListener('change', (e) => {
    window.setTargetFeed?.(e.target.value);
  });

  // ========== 2. PUBLIC RECORD (LEDGER) ==========
  document.getElementById('refreshLedgerBtn')?.addEventListener('click', () => {
    window.refreshLedger?.();
  });

  // ========== 3. LIVE ARENA ==========
  document.getElementById('notifyArenaBtn')?.addEventListener('click', () => {
    window.notifyLiveArena?.();
  });

  // ========== 4. MY CIRCLE ==========
  document.getElementById('startPhoneVerificationBtn')?.addEventListener('click', () => {
    window.startPhoneVerification?.();
  });
  document.getElementById('startZKVerificationBtn')?.addEventListener('click', () => {
    window.startZKUpgrade?.() || window.startZKVerification?.();
  });

  document.querySelectorAll('[data-circle-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.circleTab;
      document.querySelectorAll('[data-circle-tab]').forEach(b => {
        b.classList.remove('border-b-2', 'border-emerald-500', 'text-emerald-400');
        b.classList.add('text-zinc-400');
      });
      btn.classList.add('border-b-2', 'border-emerald-500', 'text-emerald-400');
      btn.classList.remove('text-zinc-400');

      window.switchCircleTab?.(tab);
    });
  });

  // ========== 5. TRUSTED VOICES ==========
  document.getElementById('witness-search')?.addEventListener('input', (e) => {
    window.filterTrustedVoices?.(e.target.value);
  });

  document.querySelectorAll('#witness-filters [data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.dataset.filter;
      document.querySelectorAll('#witness-filters [data-filter]').forEach(b => {
        b.classList.remove('border-amber-500/40', 'bg-amber-500/20', 'text-amber-400');
        b.classList.add('border-zinc-700', 'bg-zinc-800', 'text-zinc-300');
      });
      btn.classList.add('border-amber-500/40', 'bg-amber-500/20', 'text-amber-400');
      btn.classList.remove('border-zinc-700', 'bg-zinc-800', 'text-zinc-300');

      window.applyWitnessFilter?.(filter);
    });
  });

  // ========== FOOTER ==========
  document.getElementById('footerSupportBtn')?.addEventListener('click', () => {
    window.openSupportPackagesModal?.();
  });
  document.getElementById('footer-data-saver-btn')?.addEventListener('click', () => {
    window.toggleDataSaver?.();
  });

  // ========== SUPPORT MODAL ==========
  document.getElementById('closeSupportModal')?.addEventListener('click', () => {
    window.closeSupportModal?.();
  });

  document.querySelectorAll('.support-tier-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const amount = btn.dataset.amount;
      document.querySelectorAll('.support-tier-btn').forEach(b => b.classList.remove('active-tier', 'border-emerald-500', 'bg-emerald-600/20'));
      btn.classList.add('active-tier', 'border-emerald-500', 'bg-emerald-600/20');

      const customInput = document.getElementById('customSupportAmount');
      if (customInput) customInput.value = amount;

      window.setSupportAmount?.(Number(amount));
    });
  });

  document.getElementById('customSupportAmount')?.addEventListener('input', (e) => {
    window.setSupportAmount?.(Number(e.target.value) || 0);
  });

  document.getElementById('paystackPayBtn')?.addEventListener('click', () => {
    window.startPaystackPayment?.();
  });
  document.getElementById('proceedCryptoBtn')?.addEventListener('click', () => {
    window.startCryptoPayment?.();
  });
  document.getElementById('copyUsdtBtn')?.addEventListener('click', () => {
    window.copyUsdtAddress?.();
  });

  document.getElementById('supportModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'supportModal') {
      window.closeSupportModal?.();
    }
  });
}

// Call this after DOM is ready / after your bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireIndexPage);
} else {
  wireIndexPage();
}
