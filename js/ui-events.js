// js/ui-events.js
// -------------------------------------------------
// Central event wiring – no inline handlers
// Dropdowns (More + Notifications) → main.js only
// Auth / Profile → auth.js (+ safety net here)
// Tabs → main.js wireTabButtons only
// Live Voice → media.js only
// Photo/Video/Audio files + preview → composer.js only
// Publish → composer.js → window.publishTestimony (main.js)
// Data Saver → main.js only
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
  // Owned by main.js (initDataSaver + window.toggleDataSaver).
  // Do NOT wire header/mobile/footer here — avoids double-toggle on phones.

  // ---------- Support ----------
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

  // ---------- Auth / Profile (safety net – auth.js also handles these) ----------
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
  // Owned by main.js wireTabButtons() — do NOT wire here (double switchTab on phones).

  // ========== PUBLIC SQUARE – COMPOSER ==========
  // Photo / Video: HTML <label for="photoInput|videoInput"> only
  // Live Voice: media.js initMediaButtons only
  // File change + preview: composer.js only
  // Rec controls: media.js initVoiceControls only
  // Publish: composer.js → window.publishTestimony

  const mainInput = document.getElementById('mainInput');
  const charCount = document.getElementById('char-count');
  if (mainInput && charCount && !mainInput.dataset.charCountWired) {
    mainInput.dataset.charCountWired = 'true';
    on(mainInput, 'input', () => {
      charCount.textContent = `${mainInput.value.length} / 3000`;
    });
  }

  on(document.getElementById('feedSortSelect'), 'change', (e) => {
    window.applyFeedSort?.(e.target.value);
  });
  on(document.getElementById('targetFeedSelect'), 'change', (e) => {
    window.setTargetFeed?.(e.target.value);
  });

  // ========== LEDGER ==========
  on(document.getElementById('refreshLedgerBtn'), 'click', () => window.refreshLedger?.());

  // ========== LIVE ARENA ==========
  on(document.getElementById('createRoomBtn'), 'click', () => window.createLiveRoom?.());
  on(document.getElementById('notifyArenaBtn'), 'click', () => window.notifyLiveArena?.());

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

  console.log('[ui-events] wireIndexPage complete (composer/voice/tabs/data-saver left to owners)');
}

// Auto-run once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireIndexPage);
} else {
  wireIndexPage();
}
What was removed (on purpose)
Removed	Why
Data Saver clicks	main.js owns them
Nav tab clicks	main.js wireTabButtons owns them
btn-photo / btn-video click	Labels already open the inputs
btn-voice click + file fallback	Was opening audio picker; media.js owns mic
File change → handleMediaSelect	composer.js owns real handlers
Rec pause/stop/replay/rerecord/verify	media.js owns them
postButton click	composer.js → publishTestimony
What was kept
Support, Join/Profile, bookmarks, language, feed pills, char count, feed sort / target feed, ledger, arena, circle, witness filters, support modal / Paystack.

After commit — phone check
Hard refresh
Live Voice → mic prompt / record (not file picker)
Photo → one picker open
Tabs → one switch per tap
Data Saver → one toggle
Support / Profile still open
Next when ready: give me media full (Live Voice reliability), then composer full (preview / remove / HEIC).

