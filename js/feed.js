import { collection, query, orderBy, onSnapshot, where, limit } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { renderTierCircle } from './ui-components.js';

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
        snapshot.forEach((docSnap) => {
            renderPost(docSnap.id, docSnap.data());
        });
    });
}

function renderPost(id, data) {
    if (data.moderationStatus === "removed") return;

    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;   // ← Add this safety check

    const postEl = document.createElement('div');
    postEl.className = 'post-card glass rounded-3xl p-6 mb-6';
    
    const isSteward = data.authorTier === 'steward' || data.isModerator;
    let statusHTML = data.moderationStatus === "needs_review" 
        ? `<span class="inline-flex items-center gap-1 text-amber-400 text-xs">🔍 Under Review</span>` : '';

    // Build media section
    let mediaHTML = '';
    if (data.imageUrl) mediaHTML += `<img src="${data.imageUrl}" class="rounded-2xl mt-4 w-full object-cover max-h-96" alt="Evidence">`;
    if (data.audioUrl) mediaHTML += `<audio controls class="w-full mt-4"><source src="${data.audioUrl}" type="audio/webm"></audio>`;

    postEl.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-center gap-3">
                <div class="scale-50 -ml-4 -mr-4">
                    ${renderTierCircle(data.authorTier || 'citizen', data.reputation || 0)}
                </div>
                <div>
                    <p class="font-semibold">${data.author || 'Anonymous Witness'}</p>
                    <p class="text-xs text-zinc-500">${new Date(data.timestamp?.toDate?.() || data.timestamp).toLocaleString()} ${statusHTML}</p>
                </div>
            </div>
            <button onclick="showPostMenu('${id}', '${data.authorId}')" class="text-2xl text-zinc-400 hover:text-white">⋯</button>
        </div>
        ${data.content ? `<p class="my-4 text-zinc-100 leading-relaxed">${data.content}</p>` : ''}
        ${mediaHTML}
        <div class="flex items-center justify-between mt-6 pt-4 border-t border-zinc-700 text-sm">
            <div class="flex gap-6">
                <button onclick="likePost('${id}')" class="flex items-center gap-1.5 hover:text-emerald-400">👍 <span>${data.likes || 0}</span></button>
                <button onclick="commentOnPost('${id}')" class="flex items-center gap-1.5 hover:text-sky-400">💬 <span>${data.commentsCount || 0}</span></button>
                ${isSteward ? `<button onclick="escalatePost('${id}')" class="flex items-center gap-1.5 text-amber-400">🔬 Moderate</button>` : ''}
                <button onclick="reportPost('${id}')" class="flex items-center gap-1.5 text-red-400 hover:text-red-500">🚩 Report</button>
            </div>
            <button onclick="sharePost('${id}')" class="text-emerald-400">Share</button>
        </div>
    `;

    document.getElementById('feedContainer').appendChild(postEl);
}

// Global scope helpers
window.reportPost = (postId) => import('./moderation.js').then(m => m.reportContent(postId, "other"));
window.escalatePost = (postId) => import('./moderation.js').then(m => m.moderatePost(postId, 'hide'));
window.likePost = (id) => showToast("Liked!", "success");
window.commentOnPost = (id) => showToast("Comments coming soon", "info");
window.sharePost = (id) => {
    navigator.clipboard.writeText(window.location.origin + "?post=" + id);
    showToast("Link copied!", "success");
};
window.showPostMenu = (postId, authorId) => showToast("Post menu coming soon", "info");
