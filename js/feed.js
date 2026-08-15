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
    serverTimestamp 
} from "firebase/firestore";

import { db, auth } from './firebase-config.js';
import { showToast } from './utils.js';
import { renderTierCircle } from './ui-components.js';
import { hasStewardAccess } from './tier.js';
import { toggleReaction, bindReactionEvents } from './reactions.js';
import { reportContent } from './moderation.js';

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
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) {
        console.warn("Feed container element not found in DOM.");
        return;
    }

    // Refresh cached permission status
    await syncStewardPermission();

    // Cleanly unsubscribe from previous snapshot listener
    if (typeof activeFeedListener === 'function') {
        activeFeedListener();
        activeFeedListener = null;
    }

    ensureSearchAndFilterUI(feedContainer);

    feedContainer.innerHTML = `
        <div class="text-center py-12" id="feed-loading">
            <div class="animate-pulse text-zinc-400">Loading testimonies...</div>
        </div>`;

    // Event delegation on container
    if (!feedContainer.dataset.listenerAttached) {
        feedContainer.dataset.listenerAttached = "true";
        feedContainer.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;

            if (btn.disabled) return;
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');

            const action = btn.getAttribute('data-action');
            const id = btn.getAttribute('data-id');

            try {
                if (action === 'like') {
                    await handleUpvote(id);
                } else if (action === 'react') {
                    const reactionType = btn.getAttribute('data-reaction');
                    await toggleReaction(id, reactionType);
                } else if (action === 'comment') {
                    await openCommentModal(id);
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
                }
            } catch (err) {
                console.error(`Action ${action} failed:`, err);
            } finally {
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
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
            renderFilteredPosts([]);
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

        applySearchAndFilter();
    }, (error) => {
        console.error("Feed error:", error);
        feedContainer.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load feed. Check your connection or Firestore rules.</div>`;
    });
}

function ensureSearchAndFilterUI(container) {
    let existingWrapper = document.getElementById('feed-controls-wrapper');
    if (existingWrapper) {
        existingWrapper.remove();
    }

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
                applySearchAndFilter();
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
            applySearchAndFilter();
        });
    });
}

function applySearchAndFilter() {
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
        }

        return true;
    });

    renderFilteredPosts(filtered);
}

function renderFilteredPosts(posts) {
    const feedContainer = document.getElementById('feedContainer');
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
    const currentUser = auth.currentUser;
    const isOwner = currentUser && currentUser.uid === data.authorId;

    const postEl = document.createElement('div');
    postEl.className = 'post-card glass rounded-3xl p-6 mb-6 hover:border-emerald-500/35 transition-all duration-300 border border-zinc-800 bg-zinc-900/50 relative';

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

    // Synchronous evaluation using cached permission state
    const deleteBtnHTML = isOwner || isStewardUserCache 
        ? `<button data-action="delete" data-id="${id}" title="Delete Testimony" class="text-zinc-500 hover:text-red-400 text-xs transition">🗑️</button>` 
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

        ${data.content ? `<p class="mt-5 mb-4 text-zinc-100 leading-relaxed">${escapeHTML(data.content)}</p>` : ''}
        ${mediaHTML}
        ${audioHTML}

        <div class="flex items-center justify-between mt-6 pt-5 border-t border-zinc-800 text-xs flex-wrap gap-3">
            <div class="flex gap-2 sm:gap-3 flex-wrap">
                <button data-action="react" data-id="${id}" data-reaction="respect" class="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded-xl text-zinc-300 transition">
                    👍 <span>${reactions.respect || 0}</span>
                </button>
                <button data-action="react" data-id="${id}" data-reaction="truth" class="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded-xl text-zinc-300 transition">
                    💡 <span>${reactions.truth || 0}</span>
                </button>
                <button data-action="comment" data-id="${id}" class="flex items-center gap-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 px-3 py-1.5 rounded-xl text-zinc-300 transition">
                    💬 <span>${data.commentsCount || 0}</span>
                </button>
            </div>
            <div class="flex gap-4">
                <button data-action="report" data-id="${id}" class="text-red-400 hover:text-red-500 transition">Report</button>
                <button data-action="share" data-id="${id}" class="text-emerald-400 hover:text-emerald-500 transition">Share</button>
            </div>
        </div>
    `;

    container.appendChild(postEl);
}

async function handleUpvote(postId) {
    if (!auth.currentUser) {
        showToast("Please log in to support testimonies.", "error");
        return;
    }

    try {
        const postRef = doc(db, "testimonies", postId);
        await updateDoc(postRef, {
            likes: increment(1)
        });
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

function showPostMenu(postId) {
    showToast(`Post options menu for: ${postId.substring(0, 8)}...`, "info");
}

async function openCommentModal(postId) {
    showToast("Comments section loading...", "info");
}
