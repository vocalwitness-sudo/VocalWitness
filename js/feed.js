// js/feed.js - Public Square Feed with Search, Filtering & Dynamic Interactivity
import { 
    collection, 
    query, 
    where,
    orderBy,    
    onSnapshot, 
    limit, 
    doc, 
    getDoc,
    updateDoc, 
    increment, 
    deleteDoc, 
    serverTimestamp,
    runTransaction
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getFunctions, httpsCallable } from
  "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";
import { renderDownloadPackButton } from './evidence-ui.js';
import { toFullEvidencePack, downloadEvidencePack } from './evidence-pack.js';
import { db, auth } from './firebase-config.js?v=2';
import { showToast } from './utils.js';
import { renderTierCircle, renderFieldNoteBadge } from './ui-components.js';
import { hasStewardAccess, canCorroborate } from './tier.js';
import { toggleReaction } from './reactions.js';
import { applyPostDoorDecorations } from './door-ui.js';
import { state } from './app-state.js';
import { openCommentModal } from './comments.js';
import { 
    submitCorroboration, 
    getCorroborationScoreFromDoc,
    renderCorroborationUI  
} from './corroboration.js';
import { translateTestimony } from './ai-services.js';
import { escapeHTML } from './utils.js';

let activeFeedListener = null;
let allPostsCache = [];
let currentChannel = 'citizen-talk';
let searchDebounceTimer = null;
let isStewardUserCache = false;

function showNewPostsBanner(count) {
  document.getElementById('new-posts-banner')?.remove();

  const banner = document.createElement('div');
  banner.id = 'new-posts-banner';
  banner.className = 'fixed top-20 left-1/2 z-[90] -translate-x-1/2 cursor-pointer rounded-full border border-emerald-500/40 bg-emerald-500 px-5 py-2.5 text-sm font-bold text-black shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 active:scale-95';
  banner.innerHTML = `↑ ${count} new report${count > 1 ? 's' : ''} — tap to view`;
  banner.onclick = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    banner.remove();
    applySearchAndFilter(
      document.getElementById('testimonies-feed') ||
      document.getElementById('feed-container')
    );
  };
  document.body.appendChild(banner);

  setTimeout(() => banner.remove(), 12000);
}

/**
 * Returns a quiet relative time string (e.g. "2h ago", "3d ago")
 */
function timeAgo(date) {
  if (!date) return '';
  const d = date.toDate ? date.toDate() : new Date(date);
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 86400)}d ago`;
  return d.toLocaleDateString();
}

// ========== SHARE HELPERS (High-value platforms) ==========
function openShareMenu(shareUrl, title, text) {
    document.getElementById('vw-share-menu')?.remove();

    const menu = document.createElement('div');
    menu.id = 'vw-share-menu';
    menu.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4';
    menu.innerHTML = `
        <div class="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
            <div class="mb-4 flex items-center justify-between">
                <h3 class="text-base font-semibold text-white">Share this report</h3>
                <button type="button" data-share-close
                        class="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white transition">
                    ✕
                </button>
            </div>

            <div class="grid grid-cols-2 gap-3">
                <button data-share="copy"
                        class="flex flex-col items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-emerald-500/50 hover:bg-zinc-800 transition">
                    <span class="text-xl">🔗</span>
                    <span>Copy link</span>
                </button>

                <button data-share="whatsapp"
                        class="flex flex-col items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-emerald-500/50 hover:bg-zinc-800 transition">
                    <span class="text-xl">💬</span>
                    <span>WhatsApp</span>
                </button>

                <button data-share="twitter"
                        class="flex flex-col items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-emerald-500/50 hover:bg-zinc-800 transition">
                    <span class="text-xl">𝕏</span>
                    <span>Twitter / X</span>
                </button>

                <button data-share="facebook"
                        class="flex flex-col items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-emerald-500/50 hover:bg-zinc-800 transition">
                    <span class="text-xl">📘</span>
                    <span>Facebook</span>
                </button>

                <button data-share="telegram"
                        class="flex flex-col items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-emerald-500/50 hover:bg-zinc-800 transition">
                    <span class="text-xl">✈️</span>
                    <span>Telegram</span>
                </button>

                <button data-share="linkedin"
                        class="flex flex-col items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-emerald-500/50 hover:bg-zinc-800 transition">
                    <span class="text-xl">💼</span>
                    <span>LinkedIn</span>
                </button>
            </div>

            <p class="mt-4 truncate rounded-lg bg-zinc-950 px-3 py-2 text-xs text-zinc-500" title="${shareUrl}">
                ${shareUrl}
            </p>
        </div>
    `;

    document.body.appendChild(menu);

    menu.addEventListener('click', (e) => {
        if (e.target === menu || e.target.closest('[data-share-close]')) {
            menu.remove();
        }
    });

    menu.querySelectorAll('[data-share]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const type = btn.getAttribute('data-share');
            menu.remove();

            if (type === 'copy') {
                await copyToClipboard(shareUrl);
                return;
            }

            const encodedUrl = encodeURIComponent(shareUrl);
            const encodedTitle = encodeURIComponent(title);

            const urls = {
                whatsapp: `https://wa.me/?text=${encodedTitle}%20${encodedUrl}`,
                twitter:  `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`,
                facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
                telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedTitle}`,
                linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
            };

            if (urls[type]) {
                window.open(urls[type], '_blank', 'noopener,noreferrer');
            }
        });
    });
}

async function copyToClipboard(text) {
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
        } else {
            const temp = document.createElement('input');
            temp.value = text;
            temp.setAttribute('readonly', '');
            temp.style.position = 'absolute';
            temp.style.left = '-9999px';
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
        }
        showToast('Link copied to clipboard', 'success');
    } catch (err) {
        console.warn('Clipboard failed:', err);
        showToast('Could not copy link', 'error');
    }
}

/**
 * Returns the quiet "Edited · 2h ago" label if the post was edited
 */
function getEditedLabel(data) {
  if (!data.editedAt) return '';
  return `<span class="text-[11px] text-zinc-500 ml-1.5">· Edited ${timeAgo(data.editedAt)}</span>`;
}

/**
 * Checks and caches the user's steward status to prevent unhandled promises in sync renderers.
 */
async function syncStewardPermission() {
    try {
        isStewardUserCache = await hasStewardAccess();
    } catch {
        isStewardUserCache = false;
    }
}

/**
 * Initializes the feed listener
 * @param {Firestore} dbInstance 
 * @param {string} channelType - 'citizen-talk' or 'witness-voice'
 */
export async function initFeed(dbInstance = db, channelType = 'citizen-talk') {
    currentChannel = channelType;
    const feedContainer =
        document.getElementById('testimonies-feed') ||
        document.getElementById('feed-container') ||
        document.querySelector('#public-square #testimonies-feed');
    if (!feedContainer) {
        console.warn('Feed container not found');
        return;
    }
    await syncStewardPermission();
    if (typeof activeFeedListener === 'function') {
        activeFeedListener();
        activeFeedListener = null;
    }
    ensureSearchAndFilterUI(feedContainer);

    feedContainer.innerHTML = `
    <div class="text-center py-16 text-zinc-500" id="feed-loading">
        <div class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
        <p class="text-sm">Loading reports from the Square...</p>
    </div>`;

    window.addEventListener('feed-set-sort', (e) => {
        const sort = e.detail?.sort;
        if (!sort) return;
        const btn = document.querySelector(`#sortBtnGroup .sort-btn[data-sort="${sort}"]`);
        btn?.click();
    });

    if (!feedContainer.dataset.listenerAttached) {
        feedContainer.dataset.listenerAttached = 'true';
        feedContainer.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn || btn.disabled) return;

            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');

            if (action === 'toggle-translate') {
                const box = document.getElementById(`translate-box-${id}`);
                if (box) box.classList.toggle('hidden');
                return;
            }

            if (action === 'toggle-more') {
                const textEl = document.getElementById(`post-text-${id}`);
                if (!textEl) return;
                const expanded = textEl.getAttribute('data-expanded') === 'true';
                const full = textEl.getAttribute('data-full') || '';
                const preview = textEl.getAttribute('data-preview') || '';
                if (expanded) {
                    textEl.textContent = preview;
                    textEl.setAttribute('data-expanded', 'false');
                    btn.textContent = 'Read more';
                } else {
                    textEl.textContent = full;
                    textEl.setAttribute('data-expanded', 'true');
                    btn.textContent = 'Show less';
                }
                return;
            }
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');

            try {
                if (action === 'like') {
                    if (typeof handleUpvote === 'function') await handleUpvote(id);
                    else console.warn('handleUpvote is not defined');
                } else if (action === 'react') {
                    const reactionType = btn.getAttribute('data-reaction');
                    if (typeof toggleReaction === 'function') await toggleReaction(id, reactionType);
                    else console.warn('toggleReaction is not defined');
                } else if (action === 'comment') {
                    if (typeof openCommentModal === 'function') await openCommentModal(id);
                    else console.warn('openCommentModal is not defined');
                } else if (action === 'download-pack') {
                    showToast('📥 Downloading Evidence Pack: Safe verification text file with cryptographic hashes. No code installed.', 'success');
                    if (typeof handleDownloadEvidencePack === 'function') await handleDownloadEvidencePack(id);
                    else console.warn('handleDownloadEvidencePack is not defined');
                } else if (action === 'report') {
                    if (typeof window.openReportModal === 'function') {
                        window.openReportModal(id);
                    } else if (typeof reportContent === 'function') {
                        try {
                            await reportContent(id, 'other');
                            showToast('Report submitted to Stewards.', 'success');
                        } catch (err) {
                            console.error('Report action failed:', err);
                            showToast('Failed to submit report.', 'error');
                        }
                    } else {
                        console.warn('reportContent / openReportModal not available yet');
                        showToast('Report feature is temporarily unavailable. Please try again later.', 'info');
                    }
                } else if (action === 'share') {
                    try {
                        const post = (typeof allPostsCache !== 'undefined' ? allPostsCache : []).find(p => p.id === id);
                        const shareUrl = `${window.location.origin}/p/${encodeURIComponent(id)}`;
                        const title = post?.headline || post?.title || 'VocalWitness Testimony';
                        const text = post?.content
                            ? (post.content.length > 120 ? post.content.slice(0, 117) + '…' : post.content)
                            : 'Witness report shared via VocalWitness';

                        if (navigator.share && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                            navigator.share({ title, text, url: shareUrl })
                                .then(() => showToast('Shared successfully', 'success'))
                                .catch(err => {
                                    if (err?.name !== 'AbortError') {
                                        console.warn('Native share failed:', err);
                                        openShareMenu(shareUrl, title, text);
                                    }
                                });
                        } else {
                            openShareMenu(shareUrl, title, text);
                        }
                    } catch (err) {
                        if (err?.name !== 'AbortError') {
                            console.error('Share failed:', err);
                            showToast('Failed to share testimony link', 'error');
                        }
                    }
                } else if (action === 'pin') {
                    if (typeof handlePinPost === 'function') await handlePinPost(id);
                    else console.warn('handlePinPost is not defined');
                } else if (action === 'edit') {
                    await handleEditPost(id);
                } else if (action === 'hide') {
                    await handleHidePost(id, false);
                } else if (action === 'permanent-hide') {
                    await handleHidePost(id, true);
                } else if (action === 'menu') {
                    if (typeof showPostMenu === 'function') showPostMenu(id);
                    else console.warn('showPostMenu is not defined');
                } else if (action === 'corroborate') {
                    if (typeof handleCorroborate === 'function') await handleCorroborate(id, btn);
                    else console.warn('handleCorroborate is not defined');
                } else if (action === 'execute-translate') {
                    if (typeof handleTranslateAction === 'function') await handleTranslateAction(id, btn);
                    else console.warn('handleTranslateAction is not defined');
                }
            } catch (err) {
                console.error(`Action "${action}" failed:`, err);
                if (action !== 'share' && action !== 'corroborate') {
                    showToast('Something went wrong. Please try again.', 'error');
                }
            } finally {
                if (action !== 'corroborate' || !btn.classList.contains('cursor-default')) {
                    btn.disabled = false;
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }
        });
    }
    
const q = query(
    collection(db, 'testimonies'),
    where('channel', '==', currentChannel),
    orderBy('createdAt', 'desc'),
    limit(50)
);

let previousIds = new Set();
let isFirstSnapshot = true;

activeFeedListener = onSnapshot(q, (snapshot) => {
    allPostsCache = [];
    
        if (snapshot.empty) {
            renderFilteredPosts([], feedContainer);
            previousIds = new Set();
            isFirstSnapshot = false;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const postVisibility = data.feedVisibility || data.channel;
            if (!postVisibility || postVisibility === currentChannel) {
                allPostsCache.push({ id: docSnap.id, ...data });
            }
        });

        // Cache order: pinned first, then newest (final display rank is signal-based)
        allPostsCache.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            const timeA = a.createdAt?.toMillis
                ? a.createdAt.toMillis()
                : (a.timestamp?.toMillis
                    ? a.timestamp.toMillis()
                    : new Date(a.createdAt || a.timestamp || 0).getTime());
            const timeB = b.createdAt?.toMillis
                ? b.createdAt.toMillis()
                : (b.timestamp?.toMillis
                    ? b.timestamp.toMillis()
                    : new Date(b.createdAt || b.timestamp || 0).getTime());
            return timeB - timeA;
        });

        const currentIds = new Set(allPostsCache.map(p => p.id));
        let newCount = 0;
        if (!isFirstSnapshot) {
            currentIds.forEach(id => {
                if (!previousIds.has(id)) newCount++;
            });
        }
        previousIds = currentIds;
        isFirstSnapshot = false;

        applySearchAndFilter(feedContainer);

        if (newCount > 0) {
            const feedTop = feedContainer.getBoundingClientRect().top;
            const isNearTop = feedTop > -80 && window.scrollY < 200;

            if (!isNearTop) {
                showNewPostsBanner(newCount);
            } else {
                const firstCard = feedContainer.querySelector('[data-post-id]');
                if (firstCard) {
                    firstCard.classList.add('ring-2', 'ring-emerald-500/50');
                    setTimeout(() => {
                        firstCard.classList.remove('ring-2', 'ring-emerald-500/50');
                    }, 2500);
                }
            }
        }
    }, (error) => {
        console.error('Feed error:', error);
        feedContainer.innerHTML = `
            <div class="text-center py-8 text-red-400 bg-red-950/20 rounded-2xl border border-red-900/40">
                Failed to load feed items. Please refresh or try again later.
            </div>`;
    });
}
    
function ensureSearchAndFilterUI(container) {
    let existingWrapper = document.getElementById('feed-controls-wrapper');
    if (existingWrapper) existingWrapper.remove();

    const wrapper = document.createElement('div');
    wrapper.id = 'feed-controls-wrapper';
    wrapper.className = 'mb-6 flex flex-col sm:flex-row gap-3 items-center justify-between';

    wrapper.innerHTML = `
        <div class="relative w-full sm:w-72">
            <input type="text" id="feedSearchInput" placeholder="🔍 Search testimonies..." 
                   class="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition">
        </div>
        <div class="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0" id="filterBtnGroup">
            <button data-filter="all" data-active="true" class="filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition">All</button>
            <button data-filter="verified" data-active="false" class="filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition">🛡️ Circle</button>
            <button data-filter="media" data-active="false" class="filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition">📷 Media</button>
            <button data-filter="corroborated" data-active="false" class="filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition">👁️ Corroborated</button>
        </div>
    `;

    if (container.parentNode) {
        container.parentNode.insertBefore(wrapper, container);
    }

    const searchInput = document.getElementById('feedSearchInput');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                applySearchAndFilter(container);
            }, 250);
        });
    }

    const filterBtns = wrapper.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            filterBtns.forEach(b => {
                b.setAttribute('data-active', 'false');
                b.className = "filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition";
            });
            const target = e.currentTarget;
            target.setAttribute('data-active', 'true');
            target.className = "filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition";
            applySearchAndFilter(container);
        });
    });
}

function scorePost(post) {
    let s = 0;
    const hasMedia = !!(post.imageUrl || post.audioUrl || post.videoUrl);
    const corr = Number(post.corroborationCount || post.corroborationScore || 0);
    const tier = String(post.authorTier || '').toLowerCase();
    const sealed = !!(
        post.packCoreHash ||
        post.forensicHash ||
        post.evidencePack ||
        post.imageHash ||
        post.audioHash ||
        post.videoHash ||
        post.bodyHash
    );
    const phoneCircle = !!(
        post.authorPhoneVerified === true ||
        tier === 'citizen_circle' ||
        tier === 'witness_circle' ||
        tier === 'citizen-circle' ||
        tier === 'witness-circle'
    );
    const isGenesis = post.genesis === true;

    if (post.isPinned) s += 200;
    if (sealed) s += 40;
    if (hasMedia) s += 80;
    if (corr >= 1) s += 50 + Math.min(corr, 10) * 5;
    if (phoneCircle) s += 35;
    if (tier && tier !== 'citizen' && tier !== 'unverified') s += 20;
    if (isGenesis) s -= 30; // markers stay visible but below live reports

    // Light recency (hours), capped
    const t =
        (post.createdAt && typeof post.createdAt.toMillis === 'function'
            ? post.createdAt.toMillis()
            : post.createdAt?.seconds
              ? post.createdAt.seconds * 1000
              : 0) || 0;
    if (t) {
        const ageHours = (Date.now() - t) / 3.6e6;
        s += Math.max(0, 25 - Math.min(ageHours, 25));
    }

    return s;
}

function postTimeMs(post) {
    if (post.createdAt && typeof post.createdAt.toMillis === 'function') {
        return post.createdAt.toMillis();
    }
    if (post.createdAt?.seconds) return post.createdAt.seconds * 1000;
    if (post.timestamp?.toMillis) return post.timestamp.toMillis();
    return 0;
}

function applySearchAndFilter(container) {
    const searchInput = document.getElementById('feedSearchInput');
    const queryText = searchInput ? searchInput.value.toLowerCase().trim() : '';

    const activeFilterBtn = document.querySelector('#filterBtnGroup .filter-btn[data-active="true"]');
    const filterType = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'all';

    const filtered = allPostsCache.filter((post) => {
        if (
            post.moderationStatus === 'removed' ||
            post.isDeleted === true ||
            post.isHidden === true ||
            post.isPermanentlyHidden === true ||
            post.visibility === 'author_hidden' ||
            post.visibility === 'moderator_hidden'
        ) {
            return false;
        }

        const matchesSearch =
            !queryText ||
            (post.headline && post.headline.toLowerCase().includes(queryText)) ||
            (post.title && post.title.toLowerCase().includes(queryText)) ||
            (post.content && post.content.toLowerCase().includes(queryText)) ||
            (post.author && post.author.toLowerCase().includes(queryText)) ||
            (post.authorId && post.authorId.toLowerCase().includes(queryText));

        if (!matchesSearch) return false;

      if (filterType === 'verified') {
    const t = String(post.authorTier || '').toLowerCase();
    return (
        post.authorPhoneVerified === true ||
        t === 'citizen_circle' ||
        t === 'citizen-circle' ||
        t === 'witness_circle' ||
        t === 'witness-circle' ||
        post.zkVerified === true
    );
}
if (filterType === 'media') {
    return !!(post.imageUrl || post.audioUrl || post.videoUrl);
}
if (filterType === 'corroborated') {
    return (post.corroborationCount || 0) >= 1;
}
return true;
});

    // Signal-first ranking (media → corroboration → circle → sealed → recency)
    filtered.sort((a, b) => {
        const diff = scorePost(b) - scorePost(a);
        if (diff !== 0) return diff;
        return postTimeMs(b) - postTimeMs(a);
    });

    renderFilteredPosts(filtered, container);
}
window.applySearchAndFilter = applySearchAndFilter;

const SQUARE_PROMPTS = [
    {
        label: 'Power outage',
        text: 'Power outage in [area] started around [time]. Light not restored as of [time].',
    },
    {
        label: 'Water / borehole',
        text: 'Water scarcity in [area]. Borehole/tap has been dry for [days]. Residents queuing at [place].',
    },
    {
        label: 'Traffic / breakdown',
        text: 'Heavy traffic on [road] near [landmark] due to [reason]. Drivers advised to use alternative routes.',
    },
    {
        label: 'Checkpoint / road',
        text: 'Police/checkpoint at [junction] is active this evening. Drivers being stopped for routine checks.',
    },
    {
        label: 'Market / shortage',
        text: 'At [market], [item] is scarce / price is about [amount]. Observed [time/date].',
    },
];

function fillComposerFromPrompt(text) {
    const input = document.getElementById('mainInput');
    if (input) {
        input.value = text;
        input.focus();
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (typeof showToast === 'function') {
        showToast('Edit the [brackets], then Publish Report', 'info');
    }
}

function renderPromptButtonsHTML() {
    return SQUARE_PROMPTS.map(
        (p, i) => `
      <button type="button" data-square-prompt="${i}"
        class="rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:border-emerald-500/50 hover:text-white transition">
        ${p.label}
      </button>`
    ).join('');
}

function wirePromptButtons(root) {
    if (!root) return;
    root.querySelectorAll('[data-square-prompt]').forEach((btn) => {
        btn.addEventListener('click', () => {
            const p = SQUARE_PROMPTS[Number(btn.getAttribute('data-square-prompt'))];
            if (p) fillComposerFromPrompt(p.text);
        });
    });
}

function buildPromptStripEl() {
    const wrap = document.createElement('div');
    wrap.id = 'square-prompt-strip';
    wrap.className = 'mb-4 rounded-2xl border border-emerald-500/25 bg-zinc-900/60 p-4';
    wrap.innerHTML = `
    <p class="text-sm font-semibold text-white mb-1">Be the next sealed report</p>
    <p class="text-xs text-zinc-400 mb-3">One-tap prompts — edit facts, then seal &amp; publish.</p>
    <div class="flex flex-wrap gap-2">
      ${renderPromptButtonsHTML()}
    </div>`;
    wirePromptButtons(wrap);
    return wrap;
}

function renderFilteredPosts(posts, container) {
    const feedContainer =
        container ||
        document.getElementById('testimonies-feed') ||
        document.getElementById('feed-container') ||
        document.getElementById('feedContainer');

    if (!feedContainer) return;

    feedContainer.innerHTML = '';

    const searchInput = document.getElementById('feedSearchInput');
    const hasSearch = searchInput && searchInput.value.trim().length > 0;
    const activeFilterBtn = document.querySelector('#filterBtnGroup .filter-btn[data-active="true"]');
    const filterType = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'all';

    if (posts.length === 0) {
        const isFiltered = hasSearch || (filterType && filterType !== 'all');

        if (isFiltered) {
            feedContainer.innerHTML = `
                <div class="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 px-6 py-14 text-center">
                    <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800 text-2xl">🔍</div>
                    <h4 class="text-lg font-semibold text-white">No matching reports found</h4>
                    <p class="mx-auto mt-2 max-w-sm text-sm text-zinc-400">
                        Try different keywords or clear your filters to see more reports.
                    </p>
                    <button type="button" id="clear-feed-filters-btn"
                            class="mt-6 inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700">
                        Clear search &amp; filters
                    </button>
                </div>`;
            const clearBtn = document.getElementById('clear-feed-filters-btn');
            if (clearBtn) {
                clearBtn.onclick = () => {
                    const input = document.getElementById('feedSearchInput');
                    if (input) input.value = '';
                    document.querySelectorAll('#filterBtnGroup .filter-btn').forEach((btn) => {
                        btn.setAttribute('data-active', 'false');
                        btn.className =
                            'filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition';
                    });
                    const allBtn = document.querySelector('#filterBtnGroup .filter-btn[data-filter="all"]');
                    if (allBtn) {
                        allBtn.setAttribute('data-active', 'true');
                        allBtn.className =
                            'filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition';
                    }
                    applySearchAndFilter(document.getElementById('testimonies-feed'));
                };
            }
        } else {
            const isZk =
                window.currentUserData?.zkVerified === true ||
                window.currentUserData?.tier === 'witness_circle';

            feedContainer.innerHTML = `
                <div id="empty-feed-state" class="rounded-3xl border border-dashed border-emerald-500/30 bg-zinc-900/50 px-6 py-16 text-center">
                    <div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl">🗣️</div>
                    <h4 class="text-xl font-bold text-white">The Square is ready for sealed reports</h4>
<p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
    Genesis markers hold the ledger open. Be among the first citizens to publish a real sealed report.
    Media and seal cannot be quietly changed after publish.
</p>
                    <div class="mt-6 flex flex-wrap justify-center gap-2">
                      ${renderPromptButtonsHTML()}
                    </div>
                    <div class="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                        <button type="button" id="empty-speak-citizen-btn"
                                class="inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-black shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-[0.98]">
                            Speak as a Citizen
                        </button>
                        ${
                          isZk
                            ? `<button type="button" id="empty-witness-voice-btn"
                                class="inline-flex items-center gap-2 rounded-2xl border border-amber-500/50 bg-amber-950/40 px-6 py-3.5 text-sm font-semibold text-amber-300 transition hover:bg-amber-900/40">
                                🔬 Publish Witness Voice
                              </button>`
                            : ''
                        }
                    </div>
                    <p class="mt-5 text-xs text-zinc-500">Live voice carries stronger weight as evidence</p>
                </div>`;

            wirePromptButtons(feedContainer);
            document.getElementById('empty-speak-citizen-btn')?.addEventListener('click', () => {
                document.getElementById('mainInput')?.focus();
                document.getElementById('btn-voice')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
            document.getElementById('empty-witness-voice-btn')?.addEventListener('click', () => {
                if (typeof window.switchTab === 'function') window.switchTab('witness');
            });
        }
        return;
    }

    // Sparse Square: invite more reports without looking dead
    if (!hasSearch && filterType === 'all' && posts.length > 0 && posts.length < 8) {
        feedContainer.appendChild(buildPromptStripEl());
    }

    posts.forEach((post) => renderSinglePostDOM(post.id, post, feedContainer));
}
function renderSinglePostDOM(id, data, container) {
    const currentUser = auth.currentUser || state.currentUser;
    const isOwner = currentUser && currentUser.uid === data.authorId;

    const postEl = document.createElement('div');
    postEl.className = 'post-card group relative mb-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-emerald-500/30 hover:bg-zinc-900/80 sm:p-6';
    postEl.setAttribute('data-post-id', id);

    const preferredTitle = (data.headline && data.headline.trim() !== '')
        ? data.headline
        : data.title;
    const headline = preferredTitle && preferredTitle.trim() !== ''
        ? preferredTitle
        : (data.content
            ? (data.content.length > 80 ? data.content.slice(0, 80) + '...' : data.content)
            : 'Untitled Witness Report');

    const pinnedBadge = data.isPinned
        ? `<span class="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">📌 Pinned</span>`
        : '';

    let trustBadgesHTML = '';

    // 1) Sealed (primary)
    const isSealed = !!(
        data.packCoreHash ||
        data.forensicHash ||
        data.evidencePack ||
        data.imageHash ||
        data.audioHash ||
        data.videoHash ||
        data.bodyHash
    );
    if (isSealed) {
        trustBadgesHTML += `
        <span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
              title="Cryptographically sealed. Proves bits did not change after publish — not real-world truth.">
          🛡️ Sealed
        </span>`;
    }

    // 2) Media
    if (data.audioUrl || data.videoUrl || data.imageUrl) {
        const kind = data.audioUrl ? 'Voice' : data.videoUrl ? 'Video' : 'Photo';
        trustBadgesHTML += `
        <span class="bg-sky-500/10 text-sky-300 border border-sky-500/25 text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
              title="Includes ${kind.toLowerCase()} evidence">
          📷 ${kind}
        </span>`;
    }

    // 3) Corroborated
    const corrCountBadge = Number(data.corroborationCount || 0);
    if (corrCountBadge >= 1) {
        trustBadgesHTML += `
        <span class="bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
              title="Others marked I witnessed this">
          👁️ Corroborated${corrCountBadge > 1 ? ` · ${corrCountBadge}` : ''}
        </span>`;
    }

// Author tier — always show one
const tier = String(data.authorTier || '').toLowerCase();
const phoneOk =
  data.authorPhoneVerified === true ||
  tier === 'citizen_circle' ||
  tier === 'citizen-circle';
const isWitness =
  tier === 'witness_circle' ||
  tier === 'witness-circle' ||
  data.zkVerified === true;

if (isWitness) {
  trustBadgesHTML += `
    <span class="bg-violet-500/10 text-violet-300 border border-violet-500/30 text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
          title="Witness Circle — higher trust path">
      🔐 Witness Circle
    </span>`;
} else if (phoneOk) {
  trustBadgesHTML += `
    <span class="bg-sky-500/10 text-sky-300 border border-sky-500/25 text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
          title="Phone-verified Citizen Circle">
      📱 Citizen Circle
    </span>`;
} else {
  trustBadgesHTML += `
    <span class="bg-zinc-800 text-zinc-400 border border-zinc-700 text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
          title="Standard Citizen account">
      👤 Citizen
    </span>`;
}
    // Field Note (optional)
    if (data.postingStyle === 'field-note') {
        if (typeof renderFieldNoteBadge === 'function') {
            trustBadgesHTML += renderFieldNoteBadge(data);
        } else {
            const role = data.fieldNoteRole ? String(data.fieldNoteRole).trim() : '';
            const org = data.fieldNoteOrg ? String(data.fieldNoteOrg).trim() : '';
            const title = [role, org].filter(Boolean).join(' · ') || 'Field Note';
            trustBadgesHTML += `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold
                             bg-sky-500/10 text-sky-400 border border-sky-500/30"
                      title="${escapeHTML(title)}">
                    📋 Field Note
                </span>`;
        }
    }

  // Synthetic advisory only when flagged
    const claim = data.mediaOriginClaim || data.originType || data.provenanceType || '';
    const isSynthetic =
        claim === 'synthetic' ||
        claim === 'synthetic-ai' ||
        data.isSynthetic === true ||
        data.aiGenerated === true ||
        (data.syntheticScore != null && Number(data.syntheticScore) >= 70);
    if (isSynthetic) {
        trustBadgesHTML += `
        <span class="bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
            title="Synthetic / AI-assisted advisory">🤖 Advisory</span>`;
    }

    const trustContainer = trustBadgesHTML
        ? `<div class="flex flex-wrap gap-1 mt-1">${trustBadgesHTML}</div>`
        : '';

    const reactions = data.reactions || { respect: 0, truth: 0, solidarity: 0, impact: 0 };
    const hasPack = Boolean(
        data.evidencePack ||
        data.packCoreHash ||
        data.imageHash ||
        data.audioHash ||
        data.videoHash ||
        data.forensicHash
    );

    let mediaHTML = '';
    if (data.videoUrl) {
        mediaHTML = `
            <div class="mt-5 rounded-2xl overflow-hidden border border-zinc-700 bg-black">
                <video controls playsinline class="w-full max-h-96 object-cover" preload="metadata"
                        src="${escapeHTML(data.videoUrl)}"></video>
            </div>`;
    } else if (data.imageUrl) {
        mediaHTML = `
            <div class="mt-5 rounded-2xl overflow-hidden border border-zinc-700 bg-black">
              <img src="${escapeHTML(data.imageUrl)}"
                   class="w-full max-h-96 object-cover"
                   alt="Evidence"
                   loading="lazy"
                   onerror="this.parentElement.innerHTML='<div class=\\'p-6 text-center text-zinc-500 text-sm\\'>Media unavailable</div>'">
            </div>`;
    } else if (data.audioUrl) {
        let safeAudioUrl = data.audioUrl;
        if (!safeAudioUrl.includes('alt=media')) {
            safeAudioUrl += safeAudioUrl.includes('?') ? '&alt=media' : '?alt=media';
        }
        mediaHTML = `
            <div class="mt-5 bg-zinc-900 rounded-2xl p-4 border border-zinc-700">
                <audio controls preload="metadata" class="w-full" crossorigin="anonymous">
                    <source src="${escapeHTML(safeAudioUrl)}" type="audio/webm">
                    <source src="${escapeHTML(safeAudioUrl)}" type="audio/ogg">
                    Your browser does not support the audio element.
                </audio>
            </div>`;
    }

    let formattedDate = "Just now";
    if (data.createdAt?.toDate) formattedDate = data.createdAt.toDate().toLocaleString();
    else if (data.createdAt) formattedDate = new Date(data.createdAt).toLocaleString();

    const authorDisplayName = escapeHTML(
        data.author ||
        (data.authorId ? `Citizen` : 'Citizen')
    );

    let ownerControlsHTML = '';
    if (isOwner) {
        ownerControlsHTML = `
            <button data-action="edit" data-id="${id}" title="Edit Report"
                    class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-emerald-400 transition text-xs">
              ✏️
            </button>
            <button data-action="hide" data-id="${id}" title="Hide from Square"
                    class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-amber-400 transition text-xs">
              👁️‍🗨️
            </button>
            <button data-action="permanent-hide" data-id="${id}" title="Permanently Hide"
                    class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400 transition text-xs">
              🔒
            </button>
        `;
    } else if (isStewardUserCache) {
        ownerControlsHTML = `
            <button data-action="hide" data-id="${id}" title="Hide (Steward)"
                    class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-amber-400 transition text-xs">
              👁️‍🗨️
            </button>
        `;
    }

    const corrCount = data.corroborationCount || 0;
    const corrScoreHTML = corrCount > 0
        ? `<span class="corr-score text-[11px] text-emerald-400/90 font-medium tracking-tight">
               Witnessed by ${corrCount} Citizen${corrCount === 1 ? '' : 's'}
           </span>`
        : '';

    postEl.innerHTML = `
      <!-- Header -->
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          ${typeof renderTierCircle === 'function'  
            ? renderTierCircle(data.authorTier || 'citizen', data.reputation || 0)  
            : '<div class="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-lg">👤</div>'}
          
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-semibold text-zinc-100 truncate">${authorDisplayName}</p>
              ${pinnedBadge}
            </div>
            <p class="text-xs text-zinc-500 mt-0.5">
              ${formattedDate}${getEditedLabel(data)}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <button data-action="pin" data-id="${id}" title="Pin Post"  
                  class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-amber-400 transition">
            📌
          </button>
          ${ownerControlsHTML}
          <button data-action="menu" data-id="${id}"  
                  class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white transition text-lg leading-none">
            ⋯
          </button>
        </div>
      </div>
// Synthetic advisory only when flagged
    const claim = data.mediaOriginClaim || data.originType || data.provenanceType || '';
    const isSynthetic =
        claim === 'synthetic' ||
        claim === 'synthetic-ai' ||
        data.isSynthetic === true ||
        data.aiGenerated === true ||
        (data.syntheticScore != null && Number(data.syntheticScore) >= 70);
    if (isSynthetic) {
        trustBadgesHTML += `
        <span class="bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded flex items-center gap-1"
            title="Synthetic / AI-assisted advisory">🤖 Advisory</span>`;
    }

    const trustContainer = trustBadgesHTML
        ? `<div class="flex flex-wrap gap-1 mt-1">${trustBadgesHTML}</div>`
        : '';

    const reactions = data.reactions || { respect: 0, truth: 0, solidarity: 0, impact: 0 };
    const hasPack = Boolean(
        data.evidencePack ||
        data.packCoreHash ||
        data.imageHash ||
        data.audioHash ||
        data.videoHash ||
        data.forensicHash
    );

    let mediaHTML = '';
    if (data.videoUrl) {
        mediaHTML = `
            <div class="mt-5 rounded-2xl overflow-hidden border border-zinc-700 bg-black">
                <video controls playsinline class="w-full max-h-96 object-cover" preload="metadata"
                        src="${escapeHTML(data.videoUrl)}"></video>
            </div>`;
    } else if (data.imageUrl) {
        mediaHTML = `
            <div class="mt-5 rounded-2xl overflow-hidden border border-zinc-700 bg-black">
              <img src="${escapeHTML(data.imageUrl)}"
                   class="w-full max-h-96 object-cover"
                   alt="Evidence"
                   loading="lazy"
                   onerror="this.parentElement.innerHTML='<div class=\\'p-6 text-center text-zinc-500 text-sm\\'>Media unavailable</div>'">
            </div>`;
    } else if (data.audioUrl) {
        let safeAudioUrl = data.audioUrl;
        if (!safeAudioUrl.includes('alt=media')) {
            safeAudioUrl += safeAudioUrl.includes('?') ? '&alt=media' : '?alt=media';
        }
        mediaHTML = `
            <div class="mt-5 bg-zinc-900 rounded-2xl p-4 border border-zinc-700">
                <audio controls preload="metadata" class="w-full" crossorigin="anonymous">
                    <source src="${escapeHTML(safeAudioUrl)}" type="audio/webm">
                    <source src="${escapeHTML(safeAudioUrl)}" type="audio/ogg">
                    Your browser does not support the audio element.
                </audio>
            </div>`;
    }

    let formattedDate = "Just now";
    if (data.createdAt?.toDate) formattedDate = data.createdAt.toDate().toLocaleString();
    else if (data.createdAt) formattedDate = new Date(data.createdAt).toLocaleString();

    const authorDisplayName = escapeHTML(
        data.author ||
        (data.authorId ? `Citizen` : 'Citizen')
    );

    let ownerControlsHTML = '';
    if (isOwner) {
        ownerControlsHTML = `
            <button data-action="edit" data-id="${id}" title="Edit Report"
                    class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-emerald-400 transition text-xs">
              ✏️
            </button>
            <button data-action="hide" data-id="${id}" title="Hide from Square"
                    class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-amber-400 transition text-xs">
              👁️‍🗨️
            </button>
            <button data-action="permanent-hide" data-id="${id}" title="Permanently Hide"
                    class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-red-400 transition text-xs">
              🔒
            </button>
        `;
    } else if (isStewardUserCache) {
        ownerControlsHTML = `
            <button data-action="hide" data-id="${id}" title="Hide (Steward)"
                    class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-amber-400 transition text-xs">
              👁️‍🗨️
            </button>
        `;
    }

    const corrCount = data.corroborationCount || 0;
    const corrScoreHTML = corrCount > 0
        ? `<span class="corr-score text-[11px] text-emerald-400/90 font-medium tracking-tight">
               Witnessed by ${corrCount} Citizen${corrCount === 1 ? '' : 's'}
           </span>`
        : '';

    postEl.innerHTML = `
      <!-- Header -->
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3 min-w-0">
          ${typeof renderTierCircle === 'function'  
            ? renderTierCircle(data.authorTier || 'citizen', data.reputation || 0)  
            : '<div class="flex h-10 w-10 items-center justify-center rounded-full bg-zinc-800 text-lg">👤</div>'}
          
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <p class="font-semibold text-zinc-100 truncate">${authorDisplayName}</p>
              ${pinnedBadge}
            </div>
            <p class="text-xs text-zinc-500 mt-0.5">
              ${formattedDate}${getEditedLabel(data)}
            </p>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <button data-action="pin" data-id="${id}" title="Pin Post"  
                  class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-amber-400 transition">
            📌
          </button>
          ${ownerControlsHTML}
          <button data-action="menu" data-id="${id}"  
                  class="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-800 hover:text-white transition text-lg leading-none">
            ⋯
          </button>
        </div>
      </div>

      <!-- Trust Badges -->
      ${trustContainer ? `
        <div class="mt-3 flex flex-wrap gap-1.5">
          ${trustBadgesHTML}
        </div>
      ` : ''}

      <!-- Title -->
      <h3 class="mt-4 text-lg font-bold text-white leading-snug">
        ${escapeHTML(headline)}
      </h3>

      <!-- Media -->
      ${mediaHTML}
    `;
