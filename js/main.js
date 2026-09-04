// js/main.js - Core Handlers, Tab Switching & Application Entry Setup
// 1. Static Module Imports
import { state, updateAppState, isUserAuthenticated } from './app-state.js';
import { initAuth, requireAuth, updateUIForAuthState, bindHeaderEvents } from "./auth.js";
import { initFeed } from './feed.js';
import { db, auth, storage } from './firebase-config.js';
import { initLanguage } from './i18n.js';
import * as mediaModule from './media.js';
import { CitizenTalkEngine } from './vocalWitnessEngine.js';
import { initProfile } from './profile.js';
import { loadDynamicNavigation } from './navigation.js';
import { showToast } from './utils.js';
import { initBookmarks, initBookmarksView } from './bookmarks.js';
import { loadWeeklyLeaderboard, refreshTierAndUI } from './tier.js';
import { initComposer } from './composer.js';
import { createEvidencePack } from './evidence-pack.js';
import { generateSha256Hash } from './utils.js';
import {
    collection,
    addDoc,
    doc,
    updateDoc,
    serverTimestamp,
    query,
    getDocs,
    orderBy,
    limit
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// Global Module State
let engineInstance = null;
let isInitialized = false;
let listenersInitialized = false;
let isSwitchingTab = false;

// ====================== DATA SAVER HANDLER ======================
export function initDataSaver() {
    const savedState = localStorage.getItem('vocalwitness_data_saver') === 'true';
    updateAppState({ dataSaver: savedState });
    updateDataSaverUI(savedState);
}

export function toggleDataSaver() {
    const currentState = state.dataSaver || false;
    const newState = !currentState;

    updateAppState({ dataSaver: newState });
    localStorage.setItem('vocalwitness_data_saver', String(newState));
    updateDataSaverUI(newState);

    if (newState) {
        showToast("⚡ Data Saver Activated: High-res media preloading paused.", "info");
    } else {
        showToast("⚡ Data Saver Deactivated: Full quality media enabled.", "info");
    }
}

function updateDataSaverUI(isOn) {
    const statusText = isOn ? 'On' : 'Off';
    const statusClass = isOn ? 'text-emerald-400 font-bold' : 'text-zinc-400';

    // Desktop + mobile + footer status labels
    const statusIds = [
        'data-saver-status',
        'data-saver-status-mobile',
        'footer-data-saver-status'
    ];

    statusIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            el.textContent = statusText;
            el.className = statusClass;
        }
    });

    // Desktop button visual state
    const desktopBtn = document.getElementById('data-saver-btn');
    if (desktopBtn) {
        if (isOn) {
            desktopBtn.classList.add('border-emerald-500', 'bg-emerald-950/40');
        } else {
            desktopBtn.classList.remove('border-emerald-500', 'bg-emerald-950/40');
        }
    }

    // Mobile button visual state
    const mobileBtn = document.getElementById('data-saver-btn-mobile');
    if (mobileBtn) {
        if (isOn) {
            mobileBtn.classList.add('border-emerald-500', 'text-emerald-400', 'bg-emerald-950/40');
            mobileBtn.classList.remove('border-zinc-800', 'text-zinc-300', 'bg-zinc-900');
        } else {
            mobileBtn.classList.remove('border-emerald-500', 'text-emerald-400', 'bg-emerald-950/40');
            mobileBtn.classList.add('border-zinc-800', 'text-zinc-300', 'bg-zinc-900');
        }
    }
}

window.toggleDataSaver = toggleDataSaver;

// ====================== TAB SWITCHING ======================
window.switchTab = async (tab) => {
    if (isSwitchingTab) return;
    isSwitchingTab = true;
    console.log(`Switching to tab: ${tab}`);

    // 1. Update nav button visual state
    document.querySelectorAll('#main-nav button[data-tab]').forEach(btn => {
        const isActive = btn.dataset.tab === tab;
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        btn.classList.toggle('active', isActive);

        btn.classList.remove(
            'bg-emerald-500', 'border-emerald-400/50', 'text-black',
            'bg-emerald-950/70', 'text-emerald-300', 'border-emerald-700/60',
            'bg-sky-900/70', 'text-sky-300', 'border-sky-700',
            'bg-amber-900/70', 'text-amber-300', 'border-amber-700',
            'bg-zinc-900', 'text-zinc-200', 'border-zinc-700'
        );

        if (isActive) {
            if (tab === 'square') {
                btn.classList.add('bg-emerald-500', 'border-emerald-400/50', 'text-black');
            } else if (tab === 'ledger') {
                btn.classList.add('bg-emerald-950/70', 'text-emerald-300', 'border-emerald-700/60');
            } else if (tab === 'arena') {
                btn.classList.add('bg-sky-900/70', 'text-sky-300', 'border-sky-700');
            } else if (tab === 'witness') {
                btn.classList.add('bg-amber-900/70', 'text-amber-300', 'border-amber-700');
            } else {
                btn.classList.add('bg-zinc-900', 'text-zinc-200', 'border-zinc-700');
            }
        } else {
            if (btn.dataset.tab === 'ledger') {
                btn.classList.add('bg-emerald-950/70', 'text-emerald-300', 'border-emerald-700/60');
            } else if (btn.dataset.tab === 'arena') {
                btn.classList.add('bg-sky-900/70', 'text-sky-300', 'border-sky-700');
            } else if (btn.dataset.tab === 'witness') {
                btn.classList.add('bg-amber-900/70', 'text-amber-300', 'border-amber-700');
            } else {
                btn.classList.add('bg-zinc-900', 'text-zinc-200', 'border-zinc-700');
            }
        }
    });

    // 2. Hide all tab panels
    const panels = ['public-square', 'evidence-ledger', 'live-arena', 'mycircle', 'witness'];
    panels.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });

    // 3. Show the correct panel and load data
    try {
        if (tab === 'square' || tab === 'citizen') {
            const panel = document.getElementById('public-square');
            if (panel) panel.classList.remove('hidden');
            const feedEl = document.getElementById('testimonies-feed') || document.getElementById('feed-container');
            if (feedEl && typeof initFeed === 'function') {
                initFeed(db, 'citizen-talk');
            }
        } else if (tab === 'ledger') {
            const panel = document.getElementById('evidence-ledger');
            if (panel) panel.classList.remove('hidden');
            await loadEvidenceLedger();
        } else if (tab === 'arena') {
            const panel = document.getElementById('live-arena');
            if (panel) panel.classList.remove('hidden');
        } else if (tab === 'mycircle') {
            const panel = document.getElementById('mycircle');
            if (panel) panel.classList.remove('hidden');
        } else if (tab === 'witness') {
            const panel = document.getElementById('witness');
            if (panel) panel.classList.remove('hidden');
            if (typeof initFeed === 'function') {
                initFeed(db, 'witness-voice');
            }
        }
    } catch (e) {
        console.error('Tab switch error:', e);
        showToast('Failed to load tab', 'error');
    } finally {
        isSwitchingTab = false;
        state.currentTab = tab;
    }
};

window.refreshLedger = () => loadEvidenceLedger();

// ====================== PAYMENT GATEWAYS ======================
window.initiatePayment = function (amount, email = null, metadata = {}) {
    if (!requireAuth("Sign in to support VocalWitness")) return;

    if (typeof PaystackPop === 'undefined') {
        showToast("Payment gateway library not loaded. Please refresh.", "error");
        return;
    }

    try {
        const handler = PaystackPop.setup({
            key: 'pk_live_5d13a6db326f02375127aae9d0fb03678ed1d923',
            email: email || auth.currentUser?.email || '',
            amount: amount * 100,
            currency: "NGN",
            metadata: {
                source: "VocalWitness",
                userId: auth.currentUser?.uid,
                ...metadata
            },
            onSuccess: (transaction) => {
                showToast(`✅ Payment successful! Ref: ${transaction.reference}`, "success");
                window.closeSupportModal();
            },
            onCancel: () => showToast("Payment was cancelled", "info")
        });
        handler.openIframe();
    } catch (err) {
        console.error("Paystack startup error:", err);
        showToast("Unable to open payment gateway", "error");
    }
};

// Global click outside for dropdowns
window.addEventListener('click', (e) => {
    const dropdown = document.querySelector('.dropdown-container');
    const menu = document.getElementById('more-menu');
    if (menu && dropdown && !dropdown.contains(e.target)) {
        menu.classList.add('hidden');
    }
});

// ====================== MODAL CONTROLLERS ======================
const toggleModal = (modalId, show = true) => {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    if (show) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
    } else {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
};

window.openVerificationModal = () => toggleModal('verificationModal', true);
window.closeVerificationModal = () => toggleModal('verificationModal', false);
window.openQvModal = () => toggleModal('quadratic-vote-modal', true);
window.closeQvModal = () => toggleModal('quadratic-vote-modal', false);
window.openSupportModal = () => toggleModal('supportModal', true);
window.closeSupportModal = () => toggleModal('supportModal', false);

// ====================== WELCOME NOTE ======================
function showWelcomeNote() {
    if (!auth.currentUser || localStorage.getItem('hasSeenWelcome')) return;
    showToast("🎉 Welcome to VocalWitness! Your voice matters in Citizen Talk.", "success");
    localStorage.setItem('hasSeenWelcome', 'true');
}

// ====================== PUBLISH TESTIMONY ======================
window.publishTestimony = async () => {
  if (typeof requireAuth === 'function' && !requireAuth("Please sign in to share your testimony in Citizen Talk.")) {
    return;
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    showToast("Session expired. Please re-authenticate.", "error");
    return;
  }

  const titleInput = document.getElementById('testimonyTitle');
  const textarea = document.getElementById('mainInput');
  let title = titleInput ? titleInput.value.trim() : '';
  const content = textarea ? textarea.value.trim() : '';

  if (!content) {
    showToast("Please write something before publishing", "error");
    return;
  }

  if (!title && content) {
    title = content.length <= 80
      ? content
      : content.slice(0, 80).replace(/\s+\S*$/, '') + '...';
  }

  if (content.length > 4000) {
    showToast("Testimony is too long (max 4000 characters)", "error");
    return;
  }

  const postBtn = document.getElementById('postButton');
  if (postBtn) {
    postBtn.disabled = true;
    postBtn.classList.add('publishing', 'opacity-50', 'cursor-not-allowed');
  }

  try {
    // Prefer mediaModule if available, otherwise fall back to global variables
    const mediaData = (typeof mediaModule?.getCurrentMediaData === 'function')
      ? mediaModule.getCurrentMediaData()
      : {
          imageUrl: window.currentUploadedMediaUrl && window.currentMediaType === 'image' ? window.currentUploadedMediaUrl : null,
          audioUrl: window.currentUploadedMediaUrl && window.currentMediaType === 'audio' ? window.currentUploadedMediaUrl : null,
          imageHash: window.currentMediaType === 'image' ? (window.currentForensicHash || null) : null,
          audioHash: window.currentMediaType === 'audio' ? (window.currentForensicHash || null) : null,
          bodyHash: window.currentBodyHash || null,
          hasEvidencePack: !!window.currentEvidencePack,
          evidencePack: window.currentEvidencePack || null,
          packCoreHash: window.currentPackCoreHash || null,
        };

    const testimonyData = {
      title: title || null,
      authorId: currentUser.uid,
      author: currentUser.displayName || "Registered Witness",
      content: content,
      createdAt: serverTimestamp(),
      timestamp: Date.now(),
      channel: 'citizen-talk',
      feedVisibility: 'citizen-talk',
      feedMode: window.currentFeedMode || 'standard',
      imageUrl: mediaData.imageUrl || null,
      audioUrl: mediaData.audioUrl || null,
      imageHash: mediaData.imageHash || null,
      audioHash: mediaData.audioHash || null,
      hasForensic: !!(mediaData.imageHash || mediaData.audioHash),
      bodyHash: mediaData.bodyHash || null,
      hasEvidencePack: !!mediaData.hasEvidencePack,
      evidencePack: mediaData.evidencePack || null,
      packCoreHash: mediaData.packCoreHash || null
    };

    console.log('[publish] writing testimony...', {
      authorId: testimonyData.authorId,
      channel: testimonyData.channel,
      contentLen: content.length,
      hasMedia: !!(testimonyData.imageUrl || testimonyData.audioUrl)
    });

    const docRef = await addDoc(collection(db, 'testimonies'), testimonyData);
    console.log('[publish] SUCCESS:', docRef.id);

    // Non-critical update
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        lastTestimonyAt: serverTimestamp()
      });
    } catch (_) {}

    showToast("🛡️ Report sealed and published", "success");

    // Reset UI
    if (titleInput) titleInput.value = '';
    if (textarea) textarea.value = '';
    mediaModule?.resetMediaState?.();
    
    // Clear any leftover globals
    window.currentUploadedMediaUrl = null;
    window.currentMediaType = null;
    window.currentForensicHash = null;
    window.currentBodyHash = null;
    window.currentEvidencePack = null;
    window.currentPackCoreHash = null;

    if (typeof initFeed === 'function') {
      initFeed(db, 'citizen-talk');
    }

  } catch (err) {
    console.error("Publish error detail:", err);
    showToast(
      err.code === 'permission-denied'
        ? "Permission denied. Check Console logs."
        : "Failed to publish. Please try again.",
      "error"
    );
  } finally {
    if (postBtn) {
      postBtn.disabled = false;
      postBtn.classList.remove('publishing', 'opacity-50', 'cursor-not-allowed');
    }
  }
};

// ====================== EVIDENCE LEDGER ======================
async function loadEvidenceLedger() {
    const container = document.getElementById('ledgerContainer');
    if (!container) return;

    container.innerHTML = `
        <div class="glass rounded-3xl p-8 border border-zinc-700/60 shadow-2xl">
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-8 pb-6 border-b border-zinc-800">
                <div>
                    <h2 class="text-2xl font-bold text-white flex items-center gap-2">
                        <span>📜</span> Cryptographic Evidence Ledger
                    </h2>
                    <p class="text-sm text-zinc-400 mt-1">Permanent, immutable record of public testimonies.</p>
                </div>
                <button id="syncLedgerBtn" onclick="window.refreshLedger()" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-2xl text-xs font-medium text-emerald-400 transition flex items-center gap-2">
                    🔄 Sync Ledger
                </button>
            </div>
            <div id="ledgerTableInnerWrapper" class="overflow-x-auto">
                <div class="text-center py-16 text-zinc-500 animate-pulse">Loading ledger records...</div>
            </div>
        </div>`;

    const innerWrapper = document.getElementById('ledgerTableInnerWrapper');
    const syncBtn = document.getElementById('syncLedgerBtn');
    if (syncBtn) syncBtn.disabled = true;

    try {
        const q = query(
            collection(db, "testimonies"),
            orderBy("timestamp", "desc"),
            limit(20)
        );
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
            innerWrapper.innerHTML = `
                <div class="text-center py-12 text-zinc-500">
                    <p class="text-base font-medium text-zinc-400">No forensic records found yet.</p>
                </div>`;
            return;
        }

        let html = `
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="border-b border-zinc-800 text-xs text-zinc-400 uppercase tracking-wider">
                        <th class="py-3 px-4">Witness</th>
                        <th class="py-3 px-4">Content Summary</th>
                        <th class="py-3 px-4">Forensic Status</th>
                        <th class="py-3 px-4">Timestamp</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-zinc-800/60 text-sm text-zinc-300">`;

        querySnapshot.forEach((docSnapshot) => {
            const data = docSnapshot.data();
            const dateStr = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'N/A';
            const hasHash = data.imageHash || data.audioHash || data.hasForensic;
            const hashDisplay = hasHash
                ? '<span class="text-emerald-400 flex items-center gap-1 font-semibold">🔒 Verified Hash</span>'
                : '<span class="text-zinc-500">Standard</span>';

            html += `
                <tr class="hover:bg-zinc-800/40 transition">
                    <td class="py-4 px-4 font-medium text-white">${escapeHtml(data.author || 'Anonymous Witness')}</td>
                    <td class="py-4 px-4 truncate max-w-xs text-zinc-300">${escapeHtml(data.content)}</td>
                    <td class="py-4 px-4 font-mono text-xs">${hashDisplay}</td>
                    <td class="py-4 px-4 text-zinc-500 text-xs">${dateStr}</td>
                </tr>`;
        });

        html += `</tbody></table>`;
        innerWrapper.innerHTML = html;
    } catch (err) {
        console.error("Ledger fetch error:", err);
        innerWrapper.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load ledger records. Please check permissions.</div>`;
    } finally {
        if (syncBtn) syncBtn.disabled = false;
    }
}

// ====================== CURATED NEWS TICKER ======================
async function fetchCuratedNews() {
    const tickerEl = document.getElementById('ticker-content');
    if (!tickerEl) return;

    const RSS_URL = 'https://api.rss2json.com/v1/api.json?rss_url=https://feeds.bbci.co.uk/news/world/rss.xml';

    try {
        const res = await fetch(RSS_URL);
        if (!res.ok) throw new Error(`HTTP network error: ${res.status}`);
        const data = await res.json();

        if (data.status === 'ok' && Array.isArray(data.items) && data.items.length > 0) {
            const headlines = data.items.slice(0, 8).map(item => {
                const safeTitle = escapeHtml(item.title || '');
                return `<span class="ticker-item"><strong class="text-emerald-400">•</strong> ${safeTitle}</span>`;
            }).join(' &nbsp;&nbsp;&nbsp; ');
            tickerEl.innerHTML = headlines;
            return;
        }
        throw new Error('Malformed RSS payload structure');
    } catch (err) {
        console.warn("News ticker fallback active:", err.message);
        tickerEl.innerHTML = `<span class="ticker-item text-slate-400">🛡️ Public Square feed active • Zero-knowledge evidence ledger online • Standby for live updates.</span>`;
    }
}

// ====================== UTILITIES ======================
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ====================== SETUP EVENT LISTENERS ======================
function setupEventListeners() {
    if (listenersInitialized) return;
    listenersInitialized = true;
    console.log("✅ Wiring application listeners...");

    document.addEventListener('click', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;

        const action = actionTarget.dataset.action;
        switch (action) {
            case 'toggle-data-saver':
                e.preventDefault();
                toggleDataSaver();
                break;
            case 'open-support-modal':
                e.preventDefault();
                window.openSupportModal();
                break;
            case 'open-profile':
                e.preventDefault();
                if (typeof window.openProfile === 'function') {
                    window.openProfile();
                } else if (typeof window.showProfile === 'function') {
                    window.showProfile();
                }
                break;
            case 'open-bookmarks':
                e.preventDefault();
                document.querySelectorAll('.tab-view').forEach(view => view.classList.add('hidden'));
                document.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
                initBookmarksView?.();
                break;
            case 'open-notifications':
                e.preventDefault();
                showToast("🔔 Notification center coming online...", "info");
                break;
            case 'change-language':
                e.preventDefault();
                const langCode = actionTarget.value || actionTarget.dataset.lang;
                if (langCode && typeof window.changeLanguage === 'function') {
                    window.changeLanguage(langCode);
                }
                break;
            default:
                break;
        }
    });

  document.addEventListener('change', (e) => {
        const actionTarget = e.target.closest('[data-action]');
        if (!actionTarget) return;
        const action = actionTarget.dataset.action;
        if (action === 'change-language') {
            const langCode = actionTarget.value;
            if (langCode && typeof window.changeLanguage === 'function') {
                window.changeLanguage(langCode);
            }
        }
    });

    const mainNav = document.getElementById('main-nav');
    if (mainNav) {
        mainNav.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-tab]');
            if (btn) {
                e.preventDefault();
                window.switchTab(btn.dataset.tab);
            }
        });
    }

    bindHeaderEvents();

    // Initialize composer event listeners & AI moderation pipeline
    if (typeof initComposer === 'function') {
        initComposer();
    }

    document.getElementById('paystackPayBtn')?.addEventListener('click', (e) => {
        e.preventDefault();
        const amountInput = document.getElementById('customSupportAmount');
        const amount = amountInput ? parseFloat(amountInput.value) || 1000 : 1000;
        window.initiatePayment(amount);
    });

    console.log("✅ Application listeners active");
}

// ====================== NOTIFICATION DROPDOWN ======================
window.toggleNotificationDropdown = function (event) {
    event.stopPropagation();
    const dropdown = document.getElementById('notification-dropdown');
    if (!dropdown) return;
    document.getElementById('more-menu')?.classList.add('hidden');
    dropdown.classList.toggle('hidden');
};

document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('notification-dropdown');
    const container = document.getElementById('notification-container');
    const mobileBtn = document.getElementById('notification-btn-mobile');
    if (dropdown && !dropdown.classList.contains('hidden')) {
        if (!container?.contains(e.target) && !mobileBtn?.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    }
});

// ====================== MOBILE + GLOBAL SEARCH LOGIC ======================
function initHeaderSearch() {
    const mobileSearch = document.getElementById('searchInputMobile');
    const feedSearch = document.getElementById('feedSearchInput');

    const performSearch = (query) => {
        if (feedSearch && feedSearch.value !== query) {
            feedSearch.value = query;
            feedSearch.dispatchEvent(new Event('input', { bubbles: true }));
        }
        if (typeof window.applySearchAndFilter === 'function') {
            window.applySearchAndFilter();
        }
    };

    if (mobileSearch) {
        let debounce;
        mobileSearch.addEventListener('input', (e) => {
            clearTimeout(debounce);
            debounce = setTimeout(() => {
                performSearch(e.target.value.trim());
            }, 280);
        });
        mobileSearch.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performSearch(e.target.value.trim());
            }
        });
    }
}

// ====================== FOCUS BANNER ======================
function initFocusBanner() {
    const banner = document.getElementById('focus-banner');
    if (!banner) return;

    const key = 'vw_focus_banner_dismissed';
    if (localStorage.getItem(key) === '1') {
        banner.remove();
        return;
    }

    document.getElementById('dismiss-focus-banner')?.addEventListener('click', () => {
        localStorage.setItem(key, '1');
        banner.remove();
    });
}

// ====================== COMPOSER WIRING ======================
function wireTestimonyComposer() {
    let fileInput = document.getElementById('media-input');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'media-input';
        // Expanded to accept images, videos, and audio files
        fileInput.accept = 'image/jpeg,image/png,image/webp,image/heic,image/gif,video/mp4,video/quicktime,video/webm,audio/mpeg,audio/wav,audio/ogg,audio/webm';
        fileInput.className = 'hidden';
        document.body.appendChild(fileInput);
    }

    const btnPhoto = document.getElementById('btn-photo');
    if (btnPhoto && !btnPhoto.dataset.wired) {
        btnPhoto.addEventListener('click', () => fileInput.click());
        btnPhoto.dataset.wired = 'true';
    }

    // REMOVED duplicate change listener binding here! 
    // We let media.js handle the file change event exclusively to prevent double loading.
    // If media.js has an initializer, call it instead:
    if (typeof mediaModule.initMediaUploader === 'function' && !fileInput.dataset.wired) {
        mediaModule.initMediaUploader(fileInput);
    } else if (!fileInput.dataset.wired) {
        // Fallback single listener if media.js doesn't have an init method
        fileInput.addEventListener('change', async (e) => {
            const previewArea = document.getElementById('preview-area');
            if (e.target.files?.[0]) {
                try {
                    // Use a generalized media handler if available, supporting all formats
                    if (typeof mediaModule.handleMediaSelect === 'function') {
                        await mediaModule.handleMediaSelect(e, previewArea);
                    } else if (typeof mediaModule.handleImageSelect === 'function') {
                        await mediaModule.handleImageSelect(e, previewArea);
                    }
                } catch (err) {
                    console.error(err);
                    showToast('Failed to load media file', 'error');
                }
            }
        });
    }
    fileInput.dataset.wired = 'true';

    const btnVoice = document.getElementById('btn-voice');
    if (btnVoice && !btnVoice.dataset.wired) {
        btnVoice.addEventListener('click', () => {
            mediaModule.toggleVoiceRecording(btnVoice);
        });
        btnVoice.dataset.wired = 'true';
    }

    const postBtn = document.getElementById('postButton');
    if (postBtn && !postBtn.dataset.wired) {
        postBtn.addEventListener('click', () => {
            window.publishTestimony();
        });
        postBtn.dataset.wired = 'true';
    }

    console.log('✅ Testimony composer wired for multi-format media without duplication');
}
// ====================== BOOTSTRAP ======================
async function bootstrap() {
    if (isInitialized) return;
    isInitialized = true;
    console.log("🚀 VocalWitness Bootstrap started");

    try {
        initDataSaver();
        refreshTierAndUI();
        loadWeeklyLeaderboard();

        window.addEventListener('auth-changed', (e) => {
            const user = e.detail?.user;
            console.log("🔐 Auth state confirmed:", user ? `Logged in as ${user.uid}` : "Guest session");
            if (typeof updateUIForAuthState === 'function') {
                updateUIForAuthState(user);
            }
            if (!state.currentTab) {
                window.switchTab('square');
            }
            showWelcomeNote();
        });

        setupEventListeners();
        initLanguage?.();
        initProfile?.();
        initFocusBanner();

        if (typeof CitizenTalkEngine === 'function') {
            engineInstance = new CitizenTalkEngine(db, storage);
            window.engineInstance = engineInstance;
            mediaModule.setEngine?.(engineInstance);
        }

        loadDynamicNavigation?.();
        fetchCuratedNews();

        // Initialize Firebase Auth (Dispatches 'auth-changed' when resolved)
        await initAuth();

        console.log("✅ Bootstrap finished successfully");
    } catch (e) {
        console.error("Bootstrap error:", e);
        showToast?.("Failed to initialize app. Please refresh.", "error");
    } finally {
        // Smoothly fade out and remove the global splash screen once everything is settled
        const splash = document.getElementById('app-splash-screen');
        if (splash) {
            splash.style.opacity = '0';
            setTimeout(() => splash.remove(), 300);
        }
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await bootstrap();
    setTimeout(wireTestimonyComposer, 600);
    initHeaderSearch();
});
