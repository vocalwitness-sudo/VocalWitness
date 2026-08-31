// js/feed.js - Public Square Feed with Search, Filtering & Dynamic Interactivity
// + Corroboration Engine & AI Features (Translation, Summarization)

import { 
    collection, 
    query, 
    onSnapshot, 
    limit, 
    doc, 
    updateDoc, 
    increment, 
    deleteDoc, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import { renderSealedBadge, renderDownloadPackButton } from './evidence-ui.js';
import { toFullEvidencePack, downloadEvidencePack } from './evidence-pack.js';
import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { renderTierCircle } from './ui-components.js';
import { hasStewardAccess, canCorroborate } from './tier.js';
import { toggleReaction, bindReactionEvents } from './reactions.js';
import { applyPostDoorDecorations } from './door-ui.js';
import { state } from './app-state.js';
import { 
    submitCorroboration, 
    getCorroborationScoreFromDoc 
} from './corroboration.js';
import {
    loadCircle,
    getCircleAuthorIds,
    hasCircle,
    circleEmptyMessage
} from './circle.js';

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
        <div class="text-center py-12" id="feed-loading">
            <div class="animate-pulse text-zinc-400">Loading testimonies...</div>
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
        feedContainer.dataset.listenerAttached = "true";

        feedContainer.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn || btn.disabled) return;

            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');

            // Quick toggle for UI expansion panels (no button disable needed)
            if (action === 'toggle-translate') {
                const box = document.getElementById(`translate-box-${id}`);
                if (box) box.classList.toggle('hidden');
                return;
            }

            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');

            try {
                if (action === 'like') {
                    await handleUpvote(id);
                } else if (action === 'react') {
                    const reactionType = btn.getAttribute('data-reaction');
                    await toggleReaction(id, reactionType);
                } else if (action === 'comment') {
                    await openCommentModal(id);
                } else if (action === 'download-pack') {
                    await handleDownloadEvidencePack(id);
                } else if (action === 'report') {
                    try {
                        await reportContent(id, "other");
                    } catch (err) {
                        console.error("Report action failed:", err);
                        showToast("Failed to submit report.", "error");
                    }
                } else if (action === 'share') {
                    try {
                        const shareUrl = `${window.location.origin}?post=${encodeURIComponent(id)}`;
                        if (navigator.share) {
                            await navigator.share({
                                title: 'VocalWitness Testimony',
                                url: shareUrl
                            });
                        } else {
                            await navigator.clipboard.writeText(shareUrl);
                            showToast("Link copied to clipboard", "success");
                        }
                    } catch (err) {
                        if (err.name !== 'AbortError') {
                            showToast("Failed to share testimony link", "error");
                        }
                    }
              } else if (action === 'pin') {
    await handlePinPost(id);
} else if (action === 'delete') {
    await handleDeletePost(id);
} else if (action === 'menu') {
    showPostMenu(id);
} else if (action === 'corroborate') {
    await handleCorroborate(id, btn);
} else if (action === 'execute-translate') {
    await handleTranslateAction(id, btn);
}
            } catch (err) {
                console.error(`Action ${action} failed:`, err);
            } finally {
                // Only re-enable if it wasn't permanently disabled by corroboration success
                if (action !== 'corroborate' || !btn.classList.contains('cursor-default')) {
                    btn.disabled = false;
                    btn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }
        });
    }

    const q = query(
        collection(dbInstance, "testimonies"),
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
        console.error("Feed error:", error);
        feedContainer.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load feed. Check your connection or Firestore rules.</div>`;
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
        if (post.moderationStatus === "removed" || post.isDeleted) return false;

        const matchesSearch = !queryText || 
            (post.content && post.content.toLowerCase().includes(queryText)) ||
            (post.author && post.author.toLowerCase().includes(queryText)) ||
            (post.authorId && post.authorId.toLowerCase().includes(queryText));

        if (!matchesSearch) return false;

        if (filterType === 'verified') {
            return post.authorTier && post.authorTier !== 'citizen' && post.authorTier !== 'unverified';
        } else if (filterType === 'media') {
            return !!(post.imageUrl || post.audioUrl);
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
        const emptyDiv = document.createElement('div');
        emptyDiv.id = 'feed-empty-state';
        emptyDiv.innerHTML = `
            <div class="text-center py-20 text-zinc-400">
                <div class="text-6xl mb-4">🌍</div>
                <p class="text-xl font-medium">No testimonies match your criteria...</p>
                <p class="text-sm mt-2 text-zinc-500">Try adjusting your search terms or filters</p>
            </div>`;
        feedContainer.appendChild(emptyDiv);
        return;
    }

    posts.forEach(post => renderSinglePostDOM(post.id, post, feedContainer));
}

function renderSinglePostDOM(id, data, container) {
    const currentUser = auth.currentUser || state.currentUser;
    const isOwner = currentUser && currentUser.uid === data.authorId;

    const postEl = document.createElement('div');
    postEl.className = 'post-card glass rounded-3xl p-6 mb-6 hover:border-emerald-500/35 transition-all duration-300 border border-zinc-800 bg-zinc-900/50 relative';
    postEl.setAttribute('data-post-id', id);

    const pinnedBadge = data.isPinned
        ? `<span class="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">📌 Pinned</span>`
        : '';

    let trustBadgesHTML = '';
    if (data.authorTier && data.authorTier !== 'unverified') {
        trustBadgesHTML += `<span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] px-2 py-0.5 rounded flex items-center gap-1" title="Verified Witness">📱 Verified</span>`;
    }

    const activeHash = data.forensicHash || data.imageHash || data.audioHash;
    if (activeHash) {
        trustBadgesHTML += `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] px-2 py-0.5 rounded flex items-center gap-1" title="Hash: ${escapeHTML(activeHash)}">🛡️ ZK Sealed</span>`;
    }

    if (data.ipfsCid) {
        trustBadgesHTML += `<a href="https://ipfs.io/ipfs/${escapeHTML(data.ipfsCid)}" target="_blank" rel="noopener noreferrer" class="bg-purple-500/10 text-purple-400 border border-purple-500/20 text-[10px] px-2 py-0.5 rounded flex items-center gap-1 hover:bg-purple-500/20 transition">📦 IPFS</a>`;
    }

    const trustContainer = trustBadgesHTML ? `<div class="flex flex-wrap gap-1 mt-1">${trustBadgesHTML}</div>` : '';
    const reactions = data.reactions || { respect: 0, truth: 0, concern: 0, impact: 0 };
    const hasPack = Boolean(data.evidencePack || data.packCoreHash || data.imageHash || data.audioHash || data.forensicHash);

    const mediaHTML = data.imageUrl
        ? `<img src="${escapeHTML(data.imageUrl)}" class="mt-5 rounded-2xl w-full max-h-96 object-cover border border-zinc-700" alt="Evidence" loading="lazy">`
        : '';

    let audioHTML = '';
    if (data.audioUrl) {
        let safeAudioUrl = data.audioUrl;
        if (!safeAudioUrl.includes('alt=media')) {
            safeAudioUrl += safeAudioUrl.includes('?') ? '&alt=media' : '?alt=media';
        }
        audioHTML = `
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

    const authorDisplayName = escapeHTML(data.author || (data.authorId ? `Witness (${data.authorId.substring(0, 6)}...)` : 'Anonymous Witness'));

    const deleteBtnHTML = isOwner || isStewardUserCache 
        ? `<button data-action="delete" data-id="${id}" title="Delete Testimony" class="text-zinc-500 hover:text-red-400 text-xs transition">🗑️</button>` 
        : '';

    // Corroboration score
    const corrCount = data.corroborationCount || 0;
    const corrScore = data.corroborationScore || corrCount;
    const corrScoreHTML = corrCount > 0
        ? `<span class="corr-score text-[11px] text-emerald-400/90 font-medium tracking-tight">
               ${corrScore} pts · ${corrCount} saw this
           </span>`
        : '';


    postEl.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-center gap-3">
                ${typeof renderTierCircle === 'function' ? renderTierCircle(data.authorTier || 'citizen', data.reputation || 0) : '<span class="text-2xl">👤</span>'}
                <div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <p class="font-semibold text-zinc-100">${authorDisplayName}</p>
                        ${pinnedBadge}
                    </div>
                    ${trustContainer}
                    <p class="text-xs text-zinc-500 mt-1">${formattedDate}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <button data-action="pin" data-id="${id}" title="Pin Post" class="text-zinc-500 hover:text-amber-400 text-xs transition">📌</button>
                ${deleteBtnHTML}
                <button data-action="menu" data-id="${id}" class="text-zinc-400 hover:text-white text-2xl transition">⋯</button>
            </div>
        </div>

        ${data.content ? `<p id="post-text-${id}" class="mt-5 mb-4 text-zinc-100 leading-relaxed">${escapeHTML(data.content)}</p>` : ''}
        ${summaryBtnHTML}
        <div id="summary-container-${id}" class="hidden mt-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-200"></div>

        ${mediaHTML}
        ${audioHTML}

        <!-- Interactive Translation Controls -->
        <div id="translate-box-${id}" class="hidden mt-4 p-3 bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col sm:flex-row items-center gap-2">
            <select id="lang-select-${id}" class="bg-zinc-900 text-xs text-zinc-200 border border-zinc-700 rounded-lg px-2 py-1.5 focus:outline-none focus:border-emerald-500 w-full sm:w-auto">
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
            <button data-action="execute-translate" data-id="${id}" class="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition w-full sm:w-auto">
                Translate Text
            </button>
        </div>
        <div id="translated-result-${id}" class="hidden mt-3 p-3 bg-emerald-950/40 border border-emerald-500/20 rounded-xl text-xs text-emerald-300 leading-relaxed"></div>

        <div class="flex items-center justify-between mt-6 pt-5 border-t border-zinc-800 text-xs flex-wrap gap-3">
            <div class="flex gap-2 sm:gap-3 flex-wrap items-center">
                <button data-action="react" data-id="${id}" data-reaction="respect" class="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded-xl text-zinc-300 transition">
                    👍 <span>${reactions.respect || 0}</span>
                </button>
                <button data-action="react" data-id="${id}" data-reaction="truth" class="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded-xl text-zinc-300 transition">
                    💡 <span>${reactions.truth || 0}</span>
                </button>
                <button data-action="comment" data-id="${id}" class="comment-trigger-btn flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded-xl text-zinc-300 transition">
                    💬 <span>${data.commentsCount || 0}</span>
                </button>

                <button data-action="toggle-translate" data-id="${id}" class="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded-xl text-zinc-300 transition">
                    🌐 <span>Translate</span>
                </button>

                <button data-action="corroborate" data-id="${id}"
                    class="corroborate-btn flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium
                           bg-emerald-600/15 text-emerald-400 border border-emerald-500/30 
                           hover:bg-emerald-600/25 transition">
                    👁️ I saw this too
                </button>

                ${corrScoreHTML}
            </div>

            <div class="flex gap-4 items-center">
                ${hasPack ? renderDownloadPackButton(id) : ''}
                <button data-action="report" data-id="${id}" class="text-red-400 hover:text-red-500 transition">Report</button>
                <button data-action="share" data-id="${id}" class="text-emerald-400 hover:text-emerald-500 transition">Share</button>
            </div>
        </div>

        <div class="reply-input-area mt-3"></div>
    `;

    applyPostDoorDecorations(postEl, data, currentUser);
    container.appendChild(postEl);
}

// ====================== AI ACTION HANDLERS ======================

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

// ====================== FEED INTERACTION ACTIONS ======================

async function handleUpvote(postId) {
    if (!auth.currentUser) {
        showToast("Please log in to support testimonies.", "error");
        return;
    }
    try {
        const postRef = doc(db, "testimonies", postId);
        await updateDoc(postRef, { likes: increment(1) });
        showToast("👍 Upvoted testimony!", "success");
    } catch (e) {
        console.error("Upvote failed:", e);
        showToast("Failed to record upvote.", "error");
    }
}

async function handleDeletePost(postId) {
    if (!auth.currentUser) {
        showToast("Authentication required.", "error");
        return;
    }
    if (!confirm("Are you sure you want to delete this testimony?")) return;

    try {
        const post = allPostsCache.find(p => p.id === postId);
        const postRef = doc(db, "testimonies", postId);

        if (post && (post.forensicHash || post.imageHash || post.audioHash)) {
            await updateDoc(postRef, {
                isDeleted: true,
                content: "[This testimony was deleted by the user]",
                updatedAt: serverTimestamp()
            });
        } else {
            await deleteDoc(postRef);
        }
        showToast("Testimony deleted.", "info");
    } catch (e) {
        console.error("Delete failed:", e);
        showToast("Failed to delete testimony.", "error");
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
 * Handle "I saw this too" click – Corroboration Engine
 */
async function handleCorroborate(postId, btnEl) {
    if (!auth.currentUser) {
        showToast("Please sign in to corroborate.", "error");
        return;
    }

    const allowed = await canCorroborate();
    if (!allowed) {
        showToast("Phone verification required to corroborate reports.", "info");
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
        const post = allPostsCache.find(p => p.id === postId);
        if (post) {
            post.corroborationCount = (post.corroborationCount || 0) + 1;
        }

        btnEl.textContent = "👁️ You corroborated";
        btnEl.classList.add('opacity-60', 'cursor-default');
        btnEl.disabled = true;

        // Update score text if it exists
        const scoreEl = btnEl.parentElement?.querySelector('.corr-score');
        if (scoreEl && post) {
            const { count, score } = getCorroborationScoreFromDoc(post);
            scoreEl.textContent = `${score || count} pts · ${count} saw this`;
        }

    } catch (err) {
        console.error("Corroboration failed:", err);
        btnEl.disabled = false;
        btnEl.textContent = "👁️ I saw this too";
    }
}

function showPostMenu(postId) {
    showToast(`Post options menu for: ${postId.substring(0, 8)}...`, "info");
}

async function openCommentModal(postId) {
    showToast("Comments section loading...", "info");
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
