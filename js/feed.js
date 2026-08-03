// js/feed.js - Polished Public Square Feed with Search, Filtering & Interactivity
import { 
    collection, 
    query, 
    onSnapshot, 
    limit, 
    doc, 
    updateDoc, 
    increment, 
    addDoc, 
    getDocs, 
    orderBy, 
    where,
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db, app } from './firebase-config.js';
import { showToast } from './utils.js';
import { renderTierCircle } from './ui-components.js';
import { hasStewardAccess } from './tier.js';
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { handleReaction } from './reactions.js';

let activeFeedListener = null;
let allPostsCache = []; // Local cache for instant search and filtering
let currentChannel = 'citizen-talk';

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
 * Initializes the feed listener
 * @param {Firestore} dbInstance 
 * @param {string} channelType - e.g., 'citizen-talk' or 'witness-voice'
 */
export function initFeed(dbInstance = db, channelType = 'citizen-talk') {
    currentChannel = channelType;
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) {
        console.warn("Feed container element not found in DOM.");
        return;
    }

    // Clean up active snapshot listener to avoid leaks
    if (activeFeedListener) {
        activeFeedListener();
        activeFeedListener = null;
    }

    // Ensure controls are nested directly inside or clean up stale instances
    ensureSearchAndFilterUI(feedContainer);

    feedContainer.innerHTML = `
        <div class="text-center py-12" id="feed-loading">
            <div class="animate-pulse text-zinc-400">Loading testimonies...</div>
        </div>`;
    
   // Delegated event listener setup (attached once per container instance)
    if (!feedContainer.dataset.listenerAttached) {
        feedContainer.dataset.listenerAttached = "true";
        feedContainer.addEventListener('click', async (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            
            // PREVENT BUTTON STIFFNESS / DOUBLE-CLICK LOCKOUT
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
                    await handleReaction(id, reactionType);
                } else if (action === 'comment') {
                    openCommentModal(id);
                } else if (action === 'report') {
                    try {
                        const m = await import('./moderation.js');
                        if (m && m.reportContent) {
                            await m.reportContent(id, "other");
                        } else {
                            showToast("Moderation module uninitialized.", "error");
                        }
                    } catch (err) {
                        console.error("Moderation module load failure:", err);
                        showToast("Moderation module loading...", "info");
                    }
                } else if (action === 'share') {
                    try {
                        await navigator.clipboard.writeText(`${window.location.origin}?post=${id}`);
                        showToast("Link copied to clipboard", "success");
                    } catch {
                        showToast("Failed to copy share link", "error");
                    }
                } else if (action === 'pin') {
                    await handlePinPost(id);
                }
            } catch (err) {
                console.error(`Action ${action} failed:`, err);
            } finally {
                // ALWAYS RELEASE BUTTON EVEN IF BACKEND FAILS
                btn.disabled = false;
                btn.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });
    }

    // Filter by channel type if specified in document schema, or fallback to all
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
            // Filter by channel if post specifies a channel property
            if (!data.channel || data.channel === currentChannel) {
                allPostsCache.push({ id: docSnap.id, ...data });
            }
        });

        // Sort: Pinned posts first, then newest timestamp
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

// ==================== SEARCH & FILTER UI GENERATOR ====================
function ensureSearchAndFilterUI(container) {
    let existingWrapper = document.getElementById('feed-controls-wrapper');
    if (existingWrapper) {
        existingWrapper.remove(); // Remove existing wrapper to prevent stale elements on tab switch
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'feed-controls-wrapper';
    wrapper.className = 'mb-6 flex flex-col sm:flex-row gap-3 items-center justify-between';
    wrapper.innerHTML = `
        <div class="relative w-full sm:w-72">
            <input type="text" id="feedSearchInput" placeholder="🔍 Search testimonies..." 
                   class="w-full bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500 transition">
        </div>
        <div class="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
            <button data-filter="all" class="filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition">All</button>
            <button data-filter="verified" class="filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition">🛡️ Verified</button>
            <button data-filter="media" class="filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition">📷 Media</button>
        </div>
    `;

    container.parentNode.insertBefore(wrapper, container);

    document.getElementById('feedSearchInput')?.addEventListener('input', () => applySearchAndFilter());
    wrapper.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            wrapper.querySelectorAll('.filter-btn').forEach(b => {
                b.className = "filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-white transition";
            });
            e.currentTarget.className = "filter-btn px-4 py-2 rounded-xl text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition";
            applySearchAndFilter();
        });
    });
}

function applySearchAndFilter() {
    const searchInput = document.getElementById('feedSearchInput');
    const queryText = searchInput ? searchInput.value.toLowerCase().trim() : "";
    const activeFilterBtn = document.querySelector('.filter-btn.bg-emerald-500\\/20');
    const filterType = activeFilterBtn ? activeFilterBtn.getAttribute('data-filter') : 'all';

    const filtered = allPostsCache.filter(post => {
        if (post.moderationStatus === "removed") return false;

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
    const postEl = document.createElement('div');
    postEl.className = 'post-card glass rounded-3xl p-6 mb-6 hover:border-emerald-500/35 transition-all duration-300 border border-zinc-800 bg-zinc-900/50 relative';

    const pinnedBadge = data.isPinned
        ? `<span class="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] px-2.5 py-0.5 rounded-full font-medium flex items-center gap-1">📌 Pinned</span>`
        : '';

    let trustBadgesHTML = '';
    
    if (data.authorTier && data.authorTier !== 'unverified') {
        trustBadgesHTML += `<span class="bg-blue-500/10 text-blue-400 border border-blue-500/20 text-[10px] px-2 py-0.5 rounded flex items-center gap-1" title="Phone Verified Witness">📱 Verified</span>`;
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
        const safeAudioUrl = data.audioUrl.includes('?') ? data.audioUrl + '&alt=media' : data.audioUrl + '?alt=media';
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

    postEl.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-center gap-3">
                ${renderTierCircle ? renderTierCircle(data.authorTier || 'citizen', data.reputation || 0) : '<span class="text-2xl">👤</span>'}
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

// ==================== UPVOTE / LIKE BACKEND LOGIC ====================
async function handleUpvote(postId) {
    const auth = getAuth(app);
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

// ==================== PIN POST LOGIC (STEWARDS ONLY) ====================
async function handlePinPost(postId) {
    const authorized = await hasStewardAccess();
    if (!authorized) {
        showToast("Pinning posts requires Steward-level privileges.", "error");
        return;
    }

    try {
        const post = allPostsCache.find(p => p.id === postId);
        const newPinState = post ? !post.isPinned : true;

        const postRef = doc(db, "testimonies", postId);
        await updateDoc(postRef, {
            isPinned: newPinState
        });
        showToast(newPinState ? "📌 Testimony pinned successfully!" : "📌 Testimony unpinned.", "success");
    } catch (e) {
        console.error("Pin action failed:", e);
        showToast("Failed to update pin state.", "error");
    }
}

// ==================== COMMENTS MODAL & BACKEND LOGIC ====================
async function openCommentModal(postId) {
    const auth = getAuth(app);
    
    let modal = document.getElementById('commentModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'commentModal';
        modal.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-lg p-6 flex flex-col max-h-[80vh]">
            <div class="flex justify-between items-center mb-4 pb-3 border-b border-zinc-800">
                <h3 class="text-zinc-100 font-semibold text-lg">💬 Testimony Comments</h3>
                <button id="closeCommentModal" class="text-zinc-400 hover:text-white text-xl">✕</button>
            </div>
            <div id="commentsListContainer" class="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
                <div class="text-zinc-500 text-center py-6">Loading comments...</div>
            </div>
            <div class="flex gap-2 pt-3 border-t border-zinc-800">
                <input type="text" id="commentInputText" placeholder="Write a respectful comment..." 
                       class="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500">
                <button id="submitCommentBtn" class="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition">Post</button>
            </div>
        </div>
    `;

    document.getElementById('closeCommentModal').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    const commentsContainer = document.getElementById('commentsListContainer');
    
    // Fetch comments gracefully without forcing strict unindexed ordering
    try {
        const commentsRef = collection(db, "testimonies", postId, "comments");
        const snapshot = await getDocs(commentsRef);
        
        commentsContainer.innerHTML = '';
        if (snapshot.empty) {
            commentsContainer.innerHTML = `<div class="text-zinc-500 text-center py-8 text-sm">No comments yet. Be the first to add perspective.</div>`;
        } else {
            const commentsList = [];
            snapshot.forEach(docSnap => commentsList.push(docSnap.data()));
            
            // In-memory sort by date descending
            commentsList.sort((a, b) => {
                const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
                const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
                return timeB - timeA;
            });

            commentsList.forEach(cData => {
                const dateStr = cData.createdAt?.toDate ? cData.createdAt.toDate().toLocaleTimeString() : "Just now";
                const commentEl = document.createElement('div');
                commentEl.className = 'bg-zinc-950 border border-zinc-800/80 rounded-2xl p-3 text-sm';
                commentEl.innerHTML = `
                    <div class="flex justify-between items-center mb-1">
                        <span class="font-semibold text-zinc-300 text-xs">${escapeHTML(cData.authorName || 'Witness')}</span>
                        <span class="text-[10px] text-zinc-500">${dateStr}</span>
                    </div>
                    <p class="text-zinc-200 leading-relaxed">${escapeHTML(cData.content)}</p>
                `;
                commentsContainer.appendChild(commentEl);
            });
        }
    } catch (e) {
        console.error("Failed to load comments:", e);
        commentsContainer.innerHTML = `<div class="text-red-400 text-center text-xs py-4">Failed to load comments.</div>`;
    }

    document.getElementById('submitCommentBtn').onclick = async () => {
        const inputField = document.getElementById('commentInputText');
        const text = inputField ? inputField.value.trim() : "";
        if (!text) return;

        if (!auth.currentUser) {
            showToast("You must be logged in to comment.", "error");
            return;
        }

        try {
            await addDoc(collection(db, "testimonies", postId, "comments"), {
                content: text,
                authorId: auth.currentUser.uid,
                authorName: auth.currentUser.displayName || `Witness (${auth.currentUser.uid.substring(0, 5)})`,
                createdAt: serverTimestamp()
            });

            const postRef = doc(db, "testimonies", postId);
            await updateDoc(postRef, {
                commentsCount: increment(1)
            });

            showToast("Comment posted!", "success");
            modal.remove();
        } catch (e) {
            console.error("Failed to post comment:", e);
            showToast("Failed to post comment.", "error");
        }
    };
}

window.showPostMenu = (postId, authorId) => showToast("Post options available", "info");

window.addEventListener('languageChanged', () => {
    console.log("Language changed, refreshing feed UI...");
    initFeed(db, currentChannel);
});
