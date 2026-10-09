// js/feed.js - Public Square Feed with Search, Filtering & Dynamic Interactivity
import { 
    collection, 
    query, 
    onSnapshot, 
    limit, 
    doc, 
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
import { renderTierCircle } from './ui-components.js';
import { hasStewardAccess, canCorroborate } from './tier.js';
import { toggleReaction } from './reactions.js';
import { applyPostDoorDecorations } from './door-ui.js';
import { state } from './app-state.js';
import { openCommentModal } from './comments.js';
import { renderTierCircle, renderFieldNoteBadge } from './ui-components.js';
import { 
    submitCorroboration, 
    getCorroborationScoreFromDoc,
    renderCorroborationUI  
} from './corroboration.js';


let activeFeedListener = null;
let allPostsCache = [];
let currentChannel = 'citizen-talk';
let searchDebounceTimer = null;
let isStewardUserCache = false;

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
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

    // Close on backdrop or ✕
    menu.addEventListener('click', (e) => {
        if (e.target === menu || e.target.closest('[data-share-close]')) {
            menu.remove();
        }
    });

    // Handle each button
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

    // Initial loading
    feedContainer.innerHTML = `
    <div class="text-center py-16 text-zinc-500" id="feed-loading">
        <div class="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent"></div>
        <p class="text-sm">Loading reports from the Square...</p>
    </div>`;

    // Global event listener setup for set-sort
    window.addEventListener('feed-set-sort', (e) => {
        const sort = e.detail?.sort;
        if (!sort) return;
        const btn = document.querySelector(`#sortBtnGroup .sort-btn[data-sort="${sort}"]`);
        btn?.click();
    });

// Event delegation (attached only once)
    if (!feedContainer.dataset.listenerAttached) {
        feedContainer.dataset.listenerAttached = 'true';
        feedContainer.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn || btn.disabled) return;

            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');

            // Quick toggle for UI expansion panels
            if (action === 'toggle-translate') {
                const box = document.getElementById(`translate-box-${id}`);
                if (box) box.classList.toggle('hidden');
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

                        // Native share on real mobile devices
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
                            // Desktop → clean button menu
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
                    await handleHidePost(id, false);          // revocable
                } else if (action === 'permanent-hide') {
                    await handleHidePost(id, true);           // permanent
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
                // Only re-enable if it wasn't permanently disabled by successful corroboration
                if (action !== 'corroborate' || !btn.classList.contains('cursor-default')) {
                    btn.disabled = false;
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }
        });
    }

    const q = query(
        collection(dbInstance, 'testimonies'),
        limit(50)
    );

    activeFeedListener = onSnapshot(q, (snapshot) => {
        allPostsCache = [];
        if (snapshot.empty) {
            renderFilteredPosts([], feedContainer);
            return;
        }
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const postVisibility = data.feedVisibility || data.channel;
            if (!postVisibility || postVisibility === currentChannel) {
                allPostsCache.push({ id: docSnap.id, ...data });
            }
        });
        allPostsCache.sort((a, b) => {
            if (a.isPinned && !b.isPinned) return -1;
            if (!a.isPinned && b.isPinned) return 1;
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
        });
        applySearchAndFilter(feedContainer);
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
            <button data-filter="verified" data-active="false" class="filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition">🛡️ Verified</button>
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

function applySearchAndFilter(container) {
    const searchInput = document.getElementById('feedSearchInput');
    const queryText = searchInput ? searchInput.value.toLowerCase().trim() : "";

    const activeFilterBtn = document.querySelector('#filterBtnGroup .filter-btn[data-active="true"]');
    const filterType = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'all';

    const filtered = allPostsCache.filter(post => {
       if (post.moderationStatus === "removed" || post.isDeleted || post.isHidden || post.isPermanentlyHidden) return false;
        const matchesSearch = !queryText || 
            (post.headline && post.headline.toLowerCase().includes(queryText)) ||
            (post.title && post.title.toLowerCase().includes(queryText)) ||
            (post.content && post.content.toLowerCase().includes(queryText)) ||
            (post.author && post.author.toLowerCase().includes(queryText)) ||
            (post.authorId && post.authorId.toLowerCase().includes(queryText));

        if (!matchesSearch) return false;

        if (filterType === 'verified') {
            return post.authorTier && post.authorTier !== 'citizen' && post.authorTier !== 'unverified';
        } else if (filterType === 'media') {
            return !!(post.imageUrl || post.audioUrl || post.videoUrl);
        } else if (filterType === 'corroborated') {
            return (post.corroborationCount || 0) >= 1;
        }
        return true;
    });

    renderFilteredPosts(filtered, container);
}

function renderFilteredPosts(posts, container) {
    const feedContainer = container || 
        document.getElementById('testimonies-feed') ||
        document.getElementById('feed-container') ||
        document.getElementById('feedContainer');

    if (!feedContainer) return;

    feedContainer.innerHTML = '';

    if (posts.length === 0) {
        // Detect if this is a filtered/search result or truly empty Square
        const searchInput = document.getElementById('feedSearchInput');
        const hasSearch = searchInput && searchInput.value.trim().length > 0;
        const activeFilterBtn = document.querySelector('#filterBtnGroup .filter-btn[data-active="true"]');
        const filterType = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'all';
        const isFiltered = hasSearch || (filterType && filterType !== 'all');

        if (isFiltered) {
            // Case 1: User searched or filtered and got zero results
            feedContainer.innerHTML = `
                <div class="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 px-6 py-14 text-center">
                    <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-800 text-2xl">
                        🔍
                    </div>
                    <h4 class="text-lg font-semibold text-white">No matching reports found</h4>
                    <p class="mx-auto mt-2 max-w-sm text-sm text-zinc-400">
                        Try different keywords or clear your filters to see more reports.
                    </p>
                    <button type="button" 
                            onclick="
                                const input = document.getElementById('feedSearchInput');
                                if (input) input.value = '';
                                document.querySelectorAll('#filterBtnGroup .filter-btn').forEach(btn => {
                                    btn.setAttribute('data-active', 'false');
                                    btn.className = 'filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition';
                                });
                                const allBtn = document.querySelector('#filterBtnGroup .filter-btn[data-filter=\\'all\\']');
                                if (allBtn) {
                                    allBtn.setAttribute('data-active', 'true');
                                    allBtn.className = 'filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition';
                                }
                                applySearchAndFilter(document.getElementById('testimonies-feed'));
                            "
                            class="mt-6 inline-flex items-center gap-2 rounded-xl border border-zinc-700 bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700">
                        Clear search & filters
                    </button>
                </div>
            `;
        } else {
            // Case 2: Truly empty Public Square (no posts at all)
            feedContainer.innerHTML = `
                <div id="empty-feed-state" class="rounded-3xl border border-dashed border-emerald-500/30 bg-zinc-900/50 px-6 py-16 text-center">
                    <div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl">
                        🗣️
                    </div>
                    <h4 class="text-xl font-bold text-white">The Square is waiting for the first sealed reports</h4>
                    <p class="mx-auto mt-3 max-w-md text-sm leading-relaxed text-zinc-400">
                        Be among the first citizens to publish a cryptographically sealed report. 
                        Your voice becomes part of the permanent public record.
                    </p>
                    <button type="button" 
                            onclick="document.getElementById('mainInput')?.focus(); document.getElementById('btn-voice')?.scrollIntoView({behavior:'smooth', block:'center'});"
                            class="mt-7 inline-flex items-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-black shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-[0.98]">
                        <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" 
                                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 016 0v6a3 3 0 01-3 3z"/>
                        </svg>
                        Record Live Voice Now
                    </button>
                    <p class="mt-4 text-xs text-zinc-500">Recommended • Stronger evidence weight</p>
                </div>
            `;
        }
        return;
    }

    posts.forEach(post => renderSinglePostDOM(post.id, post, feedContainer));
}
  
function renderSinglePostDOM(id, data, container) {
    const currentUser = auth.currentUser || state.currentUser;
    const isOwner = currentUser && currentUser.uid === data.authorId;

    const postEl = document.createElement('div');
    postEl.className = 'post-card group relative mb-5 rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-5 transition-all duration-200 hover:border-emerald-500/30 hover:bg-zinc-900/80 sm:p-6';
    postEl.setAttribute('data-post-id', id);

    // Prefer headline (what composer writes), then title, then truncated content
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

    if (data.authorTier && data.authorTier !== 'unverified') {
        trustBadgesHTML += `<span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] px-2 py-0.5 rounded flex items-center gap-1" title="Verified Witness">📱 Verified</span>`;
    } else {
        trustBadgesHTML += `<span class="bg-zinc-800 text-zinc-400 border border-zinc-700/50 text-[10px] px-2 py-0.5 rounded flex items-center gap-1" title="Unverified Author Profile">⚠️ Unverified Source</span>`;
    }

    // Origin Claim & Synthetic Advisory — matches composer mediaOriginClaim values
    const claim = data.mediaOriginClaim || data.originType || data.provenanceType || 'unknown';
    const isSynthetic =
        claim === 'synthetic' ||
        claim === 'synthetic-ai' ||
        data.isSynthetic === true ||
        data.aiGenerated === true ||
        (data.syntheticScore != null && Number(data.syntheticScore) >= 70);

    if (isSynthetic) {
        trustBadgesHTML += `<span class="bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] px-2 py-0.5 rounded flex items-center gap-1" title="Author or system flagged synthetic / AI-assisted media">🤖 Synthetic Advisory</span>`;
    } else if (claim === 'received' || claim === 'reposted') {
        trustBadgesHTML += `<span class="bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] px-2 py-0.5 rounded flex items-center gap-1" title="Received or forwarded media">🔄 Received / Forwarded</span>`;
    } else if (claim === 'filmed_by_me') {
        trustBadgesHTML += `<span class="bg-emerald-950/40 text-emerald-400 border border-emerald-500/20 text-[10px] px-2 py-0.5 rounded flex items-center gap-1" title="Author claims direct capture">✍️ Direct Capture</span>`;
    } else {
        trustBadgesHTML += `<span class="bg-zinc-800 text-zinc-400 border border-zinc-700/50 text-[10px] px-2 py-0.5 rounded flex items-center gap-1" title="Origin not declared">❓ Unverified Origin</span>`;
    }

    const activeHash = data.forensicHash || data.imageHash || data.audioHash || data.videoHash;
    if (activeHash) {
        trustBadgesHTML += `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-2 py-0.5 rounded flex items-center gap-1" title="Hash: ${escapeHTML(activeHash)}">🛡️ ZK Sealed</span>`;
    }

    if (data.ipfsCid) {
        trustBadgesHTML += `<a href="https://ipfs.io/ipfs/${escapeHTML(data.ipfsCid)}" target="_blank" rel="noopener noreferrer" class="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] px-2 py-0.5 rounded flex items-center gap-1 hover:bg-purple-500/20 transition">📦 IPFS</a>`;
    }
            // Field Note badge (professional / org-attributed posts)
    if (data.postingStyle === 'field-note') {
        if (typeof renderFieldNoteBadge === 'function') {
            trustBadgesHTML += renderFieldNoteBadge(data);
        } else {
            // Fallback so it still works if the import is missing
            const role = data.fieldNoteRole ? String(data.fieldNoteRole).trim() : '';
            const org  = data.fieldNoteOrg  ? String(data.fieldNoteOrg).trim()  : '';
            const title = [role, org].filter(Boolean).join(' · ') || 'Field Note';
            trustBadgesHTML += `
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold
                             bg-sky-500/10 text-sky-400 border border-sky-500/30"
                      title="${escapeHTML(title)}">
                    📋 Field Note
                </span>
            `;
        }
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

    // Mutually exclusive media rendering block
    let mediaHTML = '';
    if (data.videoUrl) {
        mediaHTML = `
            <div class="mt-5 rounded-2xl overflow-hidden border border-zinc-700 bg-black">
                <video controls playsinline class="w-full max-h-96 object-cover" preload="metadata"
                       src="${escapeHTML(data.videoUrl)}"></video>
            </div>`;
    } else if (data.imageUrl) {
        mediaHTML = `<img src="${escapeHTML(data.imageUrl)}" class="mt-5 rounded-2xl w-full max-h-96 object-cover border border-zinc-700" alt="Evidence" loading="lazy">`;
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

  // Owner controls: Edit + Hide options
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
    const corrScore = data.corroborationScore || corrCount;
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

  <!-- Content -->
  ${data.content ? `
    <p id="post-text-${id}" class="mt-2 text-sm text-zinc-300 leading-relaxed whitespace-pre-line">
      ${escapeHTML(data.content)}
    </p>
  ` : ''}

  <!-- Media -->
  ${mediaHTML}

  <!-- Translation Box -->
  <div id="translate-box-${id}" class="mt-4 hidden rounded-xl border border-zinc-800 bg-zinc-950 p-3">
    <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
      <select id="lang-select-${id}" 
              class="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none sm:w-auto">
        <option value="English">English</option>
        <option value="Pidgin">Nigerian Pidgin</option>
        <option value="Hausa">Hausa</option>
        <option value="Yoruba">Yorùbá</option>
        <option value="Igbo">Igbo</option>
        <option value="Swahili">Swahili</option>
        <option value="French">French</option>
        <option value="Spanish">Spanish</option>
        <option value="Portuguese">Portuguese</option>
        <option value="Arabic">Arabic</option>
      </select>
      <button data-action="execute-translate" data-id="${id}"
              class="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white transition hover:bg-emerald-500">
        Translate Text
      </button>
    </div>
  </div>

  <div id="translated-result-${id}" 
       class="mt-3 hidden rounded-xl border border-emerald-500/20 bg-emerald-950/30 p-3 text-xs leading-relaxed text-emerald-300">
  </div>

  <!-- Action Bar -->
  <div class="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 pt-4">
    <div class="flex flex-wrap items-center gap-2">
      <button data-action="react" data-id="${id}" data-reaction="respect"
              class="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800">
        👍 <span>${reactions.respect || 0}</span>
      </button>

      <button data-action="react" data-id="${id}" data-reaction="truth"
              class="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800">
        💡 <span>${reactions.truth || 0}</span>
      </button>

      <button data-action="comment" data-id="${id}"
              class="comment-trigger-btn flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800">
        💬 <span>${data.commentsCount || 0}</span>
      </button>

      <button data-action="toggle-translate" data-id="${id}"
              class="flex items-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-zinc-800">
        🌐 Translate
      </button>

               ${(() => {
          // isOwner is already computed at the top of renderSinglePostDOM
          if (isOwner) {
              return `
                <button disabled
                        class="corroborate-btn flex items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-500 cursor-not-allowed"
                        title="You cannot corroborate your own report — only other witnesses can strengthen it">
                  👁️ Your report
                </button>`;
          }
          return `
            <button data-action="corroborate" data-id="${id}"
                    class="corroborate-btn flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-400 transition hover:bg-emerald-600/25"
                    title="I saw this too">
              👁️ I witnessed this
            </button>`;
      })()}

      ${corrScoreHTML}
    </div>

    <div class="flex items-center gap-4 text-xs">
      ${hasPack ? renderDownloadPackButton(id) : ''}
      <button data-action="report" data-id="${id}" class="text-red-400/80 transition hover:text-red-400">
        Report
      </button>
      <button data-action="share" data-id="${id}" class="text-emerald-400 transition hover:text-emerald-300">
        Share
      </button>
    </div>
  </div>

  <div class="reply-input-area mt-3"></div>
`;
    applyPostDoorDecorations(postEl, data, currentUser);
    container.appendChild(postEl);
}

// ====================== ACTION HANDLERS ======================

async function handleTranslateAction(postId, btn) {
    const langSelect = document.getElementById(`lang-select-${postId}`);
    const resultBox = document.getElementById(`translated-result-${postId}`);
    const textEl = document.getElementById(`post-text-${postId}`);

    if (!langSelect || !resultBox || !textEl) return;

    const targetLanguage = langSelect.value;
    const textToTranslate = textEl.textContent;

    if (!textToTranslate || textToTranslate.trim() === '') {
        showToast("No text content available to translate", "warning");
        return;
    }

    try {
        btn.textContent = "Translating...";
        const translatedText = await translateTestimony(textToTranslate, targetLanguage);

        resultBox.innerHTML = `<strong>🌐 ${escapeHTML(targetLanguage)}:</strong> ${escapeHTML(translatedText)}`;
        resultBox.classList.remove('hidden');
        showToast(`Translated to ${targetLanguage}`, "success");
    } catch (err) {
        console.error("Translation request failed:", err);
        showToast("Translation failed. Please try again.", "error");
    } finally {
        btn.textContent = "Translate Text";
    }
}

async function handleUpvote(postId) {
  if (!auth.currentUser) {
    showToast("Please log in to support testimonies.", "error");
    return;
  }

  const uid = auth.currentUser.uid;
  const postRef = doc(db, "testimonies", postId);

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(postRef);
      if (!snap.exists()) {
        throw new Error("Post not found");
      }

      const data = snap.data() || {};
      const likedBy = data.likedBy || {};

      // Already liked → do nothing (or toggle off if you prefer)
      if (likedBy[uid] === true) {
        throw new Error("ALREADY_LIKED");
      }

      tx.update(postRef, {
        [`likedBy.${uid}`]: true,
        likes: increment(1)
      });
    });

    showToast("👍 Upvoted testimony!", "success");
  } catch (e) {
    if (e?.message === "ALREADY_LIKED") {
      showToast("You already supported this testimony", "info");
      return;
    }
    console.error("Upvote failed:", e);
    showToast("Failed to record upvote.", "error");
  }
}

/**
 * Edit post (title + content only)
 */
async function handleEditPost(postId) {
  const post = allPostsCache.find(p => p.id === postId);
  if (!post) {
    showToast('Post not found', 'error');
    return;
  }

  const currentUser = auth.currentUser;
  if (!currentUser || currentUser.uid !== post.authorId) {
    showToast('You can only edit your own reports', 'error');
    return;
  }

  const existing = document.getElementById('edit-post-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'edit-post-modal';
  modal.className = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
      <div class="mb-5 flex items-center justify-between">
        <h3 class="text-lg font-bold text-white">Edit Report</h3>
        <button type="button" class="edit-cancel text-zinc-400 hover:text-white text-xl">✕</button>
      </div>

      <input type="text" id="edit-title" maxlength="120"
             value="${escapeHTML(post.headline || post.title || '')}"
             placeholder="Title (optional)"
             class="mb-3 w-full rounded-xl border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none">

      <textarea id="edit-content" rows="5" maxlength="2000"
                class="mb-4 w-full resize-none rounded-xl border border-zinc-700 bg-zinc-800 p-4 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none">${escapeHTML(post.content || '')}</textarea>

      <p class="mb-5 text-xs text-zinc-500">
        Media cannot be changed after sealing. Only text can be edited.
      </p>

      <div class="flex justify-end gap-3">
        <button type="button" class="edit-cancel rounded-xl px-5 py-2.5 text-sm font-medium text-zinc-400 hover:bg-zinc-800 hover:text-white">
          Cancel
        </button>
        <button type="button" id="edit-save-btn"
                class="rounded-xl bg-emerald-500 px-6 py-2.5 text-sm font-bold text-black hover:bg-emerald-400 active:scale-95">
          Save Changes
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelectorAll('.edit-cancel').forEach(btn => btn.onclick = close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });

  modal.querySelector('#edit-save-btn').onclick = async () => {
    const newTitle   = document.getElementById('edit-title').value.trim();
    const newContent = document.getElementById('edit-content').value.trim();

    if (!newContent) {
      showToast('Content cannot be empty', 'error');
      return;
    }

    const saveBtn = document.getElementById('edit-save-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';

    try {
      await updateDoc(doc(db, 'testimonies', postId), {
        headline: newTitle || null,
        title: newTitle || null,
        content: newContent,
        editedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      showToast('Report updated', 'success');
      close();
    } catch (err) {
      console.error('Edit failed:', err);
      showToast('Failed to update report', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
  };
}

/**
 * Hide post (revocable or permanent)
 * @param {string} postId
 * @param {boolean} permanent - true = cannot be unhidden later
 */
async function handleHidePost(postId, permanent = false) {
  const post = allPostsCache.find(p => p.id === postId);
  if (!post) {
    showToast('Post not found', 'error');
    return;
  }

  const currentUser = auth.currentUser;
  const isOwner = currentUser && currentUser.uid === post.authorId;

  if (!isOwner && !isStewardUserCache) {
    showToast('You can only hide your own reports', 'error');
    return;
  }

  if (permanent) {
    const confirmed = confirm(
      '⚠️ PERMANENTLY HIDE this report?\n\n' +
      'This cannot be undone.\n' +
      'The report will never appear in the Public Square again.\n\n' +
      'The sealed record is still preserved for integrity, but it will be hidden from public view forever.'
    );
    if (!confirmed) return;
  } else {
    const confirmed = confirm(
      'Hide this report from the Public Square?\n\n' +
      'You can restore it later from "My Reports".'
    );
    if (!confirmed) return;
  }

  try {
    const updateData = {
      isHidden: true,
      hiddenAt: serverTimestamp(),
      hiddenBy: currentUser.uid,
      updatedAt: serverTimestamp()
    };

    if (permanent) {
      updateData.isPermanentlyHidden = true;
    }

    await updateDoc(doc(db, 'testimonies', postId), updateData);

    showToast(
      permanent
        ? 'Report permanently hidden from the Square'
        : 'Report hidden. You can restore it later from My Reports.',
      'success'
    );
  } catch (err) {
    console.error('Hide failed:', err);
    showToast('Failed to hide report', 'error');
  }
}
async function handlePinPost(postId) {
    const isSteward = await hasStewardAccess();
    if (!isSteward) {
        showToast("Only Stewards can pin testimonies.", "error");
        return;
    }

    try {
        const post = allPostsCache.find(p => p.id === postId);
        if (!post) return;

        const newPinnedState = !post.isPinned;
        const postRef = doc(db, "testimonies", postId);

        await updateDoc(postRef, {
            isPinned: newPinnedState,
            pinnedAt: newPinnedState ? serverTimestamp() : null
        });

        showToast(newPinnedState ? "📌 Post pinned to top" : "📌 Post unpinned", "info");
    } catch (e) {
        console.error("Pin operation failed:", e);
        showToast("Failed to toggle pin state.", "error");
    }
}

/**
 * Handle "I witnessed this" click – Corroboration Engine
 */
async function handleCorroborate(postId, btnEl) {
    if (!auth.currentUser) {
        showToast("Please sign in to corroborate a report.", "error");
        return;
    }

    // Extra safety: block self-corroboration in the UI layer too
    const post = allPostsCache.find(p => p.id === postId);
    if (post && post.authorId === auth.currentUser.uid) {
        showToast(
            "You can’t corroborate your own report. Only other witnesses who also saw the event can strengthen it — this keeps the public record honest.",
            "info"
        );
        return;
    }

    const allowed = await canCorroborate();
    if (!allowed) {
        showToast(
            "Phone verification is required to corroborate reports. This helps keep bots and spam out of the Square.",
            "info"
        );
        const modal = document.getElementById('phoneVerificationModal') ||
                      document.getElementById('phone-upgrade-modal') ||
                      document.getElementById('verificationModal');
        if (modal) {
            modal.classList.remove('hidden');
            modal.style.display = 'flex';
        }
        return;
    }

    const note = prompt("Optional short note (max 280 chars):\nWhat did you also see / hear?");
    if (note === null) return; // user cancelled

    try {
        btnEl.disabled = true;
        btnEl.textContent = "Sealing…";

        await submitCorroboration(postId, {
            note: (note || "").trim().slice(0, 280)
        });

        // Optimistic UI update
        if (post) {
            post.corroborationCount = (post.corroborationCount || 0) + 1;
        }

        btnEl.textContent = "👁️ You witnessed this";
        btnEl.classList.add('opacity-60', 'cursor-default');
        btnEl.disabled = true;

        const scoreEl = btnEl.parentElement?.querySelector('.corr-score');
        if (scoreEl && post) {
            const count = post.corroborationCount || 1;
            scoreEl.textContent = `Witnessed by ${count} Citizen${count === 1 ? '' : 's'}`;
        }
    } catch (err) {
        console.error("Corroboration failed:", err);

        const msg = (err?.message || String(err)).toLowerCase();
        if (msg.includes("self-corroboration") || msg.includes("self corroboration")) {
            showToast(
                "You can’t corroborate your own report. Only other witnesses who also saw the event can strengthen it — this keeps the public record honest.",
                "info"
            );
        } else if (msg.includes("insufficient tier") || msg.includes("phone")) {
            showToast(
                "Phone verification is required to corroborate reports. This helps keep bots and spam out of the Square.",
                "info"
            );
        } else {
            showToast(err.message || "Corroboration failed. Please try again.", "error");
        }

        btnEl.disabled = false;
        btnEl.textContent = "👁️ I witnessed this";
    }
}
function showPostMenu(postId) {
    showToast(`Post options menu for: ${postId.substring(0, 8)}...`, "info");
}


async function handleDownloadEvidencePack(postId) {
    try {
        const post = allPostsCache.find(p => p.id === postId);
        if (!post) {
            showToast('Post not found', 'error');
            return;
        }

        const core = {
            schemaVersion: post.evidencePack?.schemaVersion || 'vocalwitness.evidence-pack.v1',
            content: {
                body: post.content || '',
                bodyHash: post.bodyHash || null,
                channel: post.feedVisibility || post.channel || 'citizen-talk'
            },
            media: [],
            identity: {
                mode: post.isAnonymous ? 'ANONYMOUS' : 'IDENTIFIED',
                authorId: post.authorId || null,
                displayName: post.author || null,
                phoneOnPublicRecord: false
            },
            timestamps: {
                clientCaptureMs: post.evidencePack?.clientCaptureMs || post.timestamp || Date.now()
            },
            environment: {
                app: 'VocalWitness',
                hashApi: 'WebCrypto.subtle.digest SHA-256'
            }
        };

        if (post.imageUrl && post.imageHash) {
            core.media.push({
                role: 'image',
                url: post.imageUrl,
                hashAlg: 'SHA-256',
                hashCapture: post.imageHash,
                hashAfterUpload: post.imageHash,
                hashMatch: true,
                exifScrubbed: true
            });
        }

        if (post.audioUrl && post.audioHash) {
            core.media.push({
                role: 'audio',
                url: post.audioUrl,
                hashAlg: 'SHA-256',
                hashCapture: post.audioHash,
                hashAfterUpload: post.audioHash,
                hashMatch: true
            });
        }

        if (post.videoUrl && post.videoHash) {
            core.media.push({
                role: 'video',
                url: post.videoUrl,
                hashAlg: 'SHA-256',
                hashCapture: post.videoHash,
                hashAfterUpload: post.videoHash,
                hashMatch: true
            });
        }

        const fullPack = toFullEvidencePack(
            core,
            post.packCoreHash || post.evidencePack?.packCoreHash || null,
            post.evidencePack?.rfc3161 || null,
            postId
        );

        downloadEvidencePack(fullPack, postId);
        showToast('Evidence pack downloaded', 'success');
    } catch (err) {
        console.error('Download pack failed:', err);
        showToast('Could not prepare evidence pack', 'error');
    }
}

// ====================== FEED FILTER PILLS ======================
document.addEventListener('DOMContentLoaded', () => {
  const pills = document.querySelectorAll('.feed-pill');

  pills.forEach(button => {
    button.addEventListener('click', () => {
      // 1. Reset all pills to inactive style
      pills.forEach(btn => {
        btn.classList.remove(
          'active', 'bg-emerald-500', 'text-black',
          'bg-emerald-500/10', 'border-emerald-500/40', 'text-emerald-400'
        );
        btn.classList.add('border', 'border-zinc-800', 'bg-zinc-900', 'text-zinc-300');
      });

      // 2. Style the clicked pill
      button.classList.remove('border', 'border-zinc-800', 'bg-zinc-900', 'text-zinc-300');
      button.classList.add('active');

      if (button.dataset.filter === 'zk-verified') {
        button.classList.add('bg-emerald-500/10', 'border-emerald-500/40', 'text-emerald-400');
      } else {
        button.classList.add('bg-emerald-500', 'text-black');
      }

      // 3. Filter the feed
      const filter = button.dataset.filter;
      console.log('Filtering feed by:', filter);

      // Call your existing feed function
      if (typeof initFeed === 'function') {
        if (filter === 'all') {
          initFeed(db, 'all');
        } else {
          initFeed(db, filter);
        }
      }
    });
  });
});
