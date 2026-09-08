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
    // add mobile close logic if you have a separate mobile dropdown
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
      // remove active from siblings
      document.querySelectorAll('.feed-pill').forEach(p => p.classList.remove('active', 'bg-emerald-500', 'text-black'));
      pill.classList.add('active', 'bg-emerald-500', 'text-black');
      window.applyFeedFilter?.(filter);
    });
  });

  // ---------- Main navigation tabs ----------
  document.querySelectorAll('.nav-tab[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;
      // visual state
      document.querySelectorAll('.nav-tab').forEach(t => {
        t.classList.remove('active', 'bg-emerald-500', 'text-black', 'border-emerald-400/50');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active', 'bg-emerald-500', 'text-black', 'border-emerald-400/50');
      tab.setAttribute('aria-selected', 'true');

      window.switchMainTab?.(target);   // your existing router / tab switcher
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

    // close on outside click
    document.addEventListener('click', () => {
      moreMenu.classList.add('hidden');
      moreBtn.setAttribute('aria-expanded', 'false');
    });
  }
}

// Call this after DOM is ready / after your bootstrap
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', wireIndexPage);
} else {
  wireIndexPage();
}
