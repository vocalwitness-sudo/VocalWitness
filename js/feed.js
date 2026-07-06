// js/feed.js - Enhanced with Action Menu & Moderation Filtering
import {
    collection, query, orderBy, onSnapshot, where, limit, doc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { getCurrentUserTier } from './tier.js';

let activeFeedListener = null;

export function initFeed(dbInstance, feedType = 'citizen-talk') {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    if (activeFeedListener) activeFeedListener();
    feedContainer.innerHTML = '<div class="text-center py-8 text-zinc-400">Loading testimonies...</div>';

    const effectiveFeed = (feedType === 'true-witness' || feedType === 'live') ? 'citizen-talk' : feedType;

    const q = query(
        collection(dbInstance, "testimonies"),
        where("feedVisibility", "==", effectiveFeed),
        orderBy("timestamp", "desc"),
        limit(20)
    );

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = '';
        if (snapshot.empty) {
            feedContainer.innerHTML = `<div class="text-center py-12 text-zinc-400">No testimonies yet. Be the first!</div>`;
            return;
        }
        
        let visiblePostsCount = 0;
        snapshot.forEach((docSnap) => {
            const added = renderPost(docSnap.id, docSnap.data());
            if (added) visiblePostsCount++;
        });

        if (visiblePostsCount === 0) {
            feedContainer.innerHTML = `<div class="text-center py-12 text-zinc-400">No public testimonies available right now.</div>`;
        }
    });
}

function renderPost(id, data) {
    // === Moderation Filtering ===
    // Hide heavily flagged content from main feed
    if (data.needsHumanReview === true && data.moderationSafe === false) {
        return false; // Skip rendering this post
    }

    const postEl = document.createElement('div');
    postEl.className = 'post-card glass rounded-3xl p-6 mb-6 transition-all hover:scale-[1.01]';

    let mediaHTML = '';
    if (data.imageUrl) mediaHTML += `<img src="${data.imageUrl}" class="rounded-2xl mt-4 w-full object-cover max-h-96" alt="Evidence">`;
    if (data.audioUrl) mediaHTML += `<audio controls class="w-full mt-4"><source src="${data.audioUrl}" type="audio/webm"></audio>`;

    // Render an optional safe-flag warning badge or note if provided by moderation
    let moderationNoticeHTML = '';
    if (data.moderationNote) {
        moderationNoticeHTML = `
            <div class="mt-4 text-xs text-amber-400 bg-amber-900/30 p-3 rounded-2xl">
                ⚠️ ${data.moderationNote}
            </div>
        `;
    }

    postEl.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-zinc-700 rounded-2xl flex items-center justify-center text-2xl">👤</div>
                <div>
                    <p class="font-semibold">${data.author || 'Anonymous Witness'}</p>
                    <p class="text-xs text-zinc-500">${new Date(data.timestamp).toLocaleString()}</p>
                </div>
            </div>
            <button onclick="showPostMenu('${id}', '${data.authorId}')" class="text-2xl text-zinc-400 hover:text-white">⋯</button>
        </div>

        ${data.content ? `<p class="my-4 text-zinc-100 leading-relaxed">${data.content}</p>` : ''}
        ${mediaHTML}
        ${moderationNoticeHTML}

        <div class="flex items-center justify-between mt-6 pt-4 border-t border-zinc-700 text-sm">
            <div class="flex gap-6">
                <button onclick="likePost('${id}')" class="flex items-center gap-1.5 hover:text-emerald-400 transition-colors">
                    👍 <span id="like-count-${id}">${data.likes || 0}</span>
                </button>
                <button onclick="commentOnPost('${id}')" class="flex items-center gap-1.5 hover:text-sky-400 transition-colors">
                    💬 <span>${data.commentsCount || 0}</span>
                </button>
            </div>
            <button onclick="sharePost('${id}')" class="text-emerald-400 hover:text-emerald-300">Share</button>
        </div>
    `;

    document.getElementById('feedContainer').appendChild(postEl);
    return true;
}

// Post Action Menu
window.showPostMenu = function(postId, authorId) {
    const isOwner = auth.currentUser && auth.currentUser.uid === authorId;
    const options = isOwner 
        ? `Edit | Delete` 
        : `Report`;

    if (confirm(`Post Actions:\n${options}\n\nChoose action?`)) {
        if (isOwner) {
            if (confirm("Delete this testimony?")) deletePost(postId);
        } else {
            showToast("Reported to moderators", "info");
        }
    }
};

async function deletePost(postId) {
    if (!confirm("Delete this testimony permanently?")) return;
    try {
        await deleteDoc(doc(db, "testimonies", postId));
        showToast("Testimony deleted", "success");
        window.loadFeed('citizen-talk');
    } catch (e) {
        showToast("Failed to delete", "error");
    }
}

// Stub functions - expand later
window.likePost = function(id) { showToast("Liked!", "success"); };
window.commentOnPost = function(id) { showToast("Comments coming soon", "info"); };
window.sharePost = function(id) { 
    navigator.clipboard.writeText(window.location.origin + "?post=" + id);
    showToast("Link copied!", "success");
};
