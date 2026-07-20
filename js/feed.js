// js/feed.js - Polished Public Square Feed
import { collection, query, orderBy, onSnapshot, where, limit } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { renderTierCircle } from './ui-components.js';

let activeFeedListener = null;

export function initFeed(dbInstance, feedType = 'citizen-talk') {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    // Clean up old listener
    if (activeFeedListener) activeFeedListener();

    feedContainer.innerHTML = `
        <div class="text-center py-12">
            <div class="animate-pulse text-zinc-400">Loading testimonies from the Square...</div>
        </div>`;

    const effectiveFeed = (feedType === 'true-witness' || feedType === 'live') ? 'citizen-talk' : feedType;

    const q = query(
        collection(dbInstance, "testimonies"),
        where("feedVisibility", "==", effectiveFeed),
        orderBy("timestamp", "desc"),
        limit(30)
    );

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = '';

        if (snapshot.empty) {
            feedContainer.innerHTML = `
                <div class="text-center py-20 text-zinc-400">
                    <div class="text-6xl mb-4">🌍</div>
                    <p class="text-xl">The Square is quiet...</p>
                    <p class="text-sm mt-2">Be the first to share your testimony</p>
                </div>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            renderPost(docSnap.id, docSnap.data());
        });
    }, (error) => {
        console.error("Feed error:", error);
        feedContainer.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load feed. Check your connection.</div>`;
    });
}

function renderPost(id, data) {
    if (data.moderationStatus === "removed") return;

    const postEl = document.createElement('div');
    postEl.className = 'glass rounded-3xl p-6 mb-6 hover:border-emerald-500/30 transition-all duration-300';

    const mediaHTML = data.imageUrl ? 
        `<img src="${data.imageUrl}" class="mt-5 rounded-2xl w-full max-h-96 object-cover border border-zinc-700" alt="Evidence">` : '';

    const audioHTML = data.audioUrl ? 
        `<div class="mt-5 bg-zinc-900 rounded-2xl p-4 border border-zinc-700">
            <audio controls class="w-full"><source src="${data.audioUrl}" type="audio/webm"></audio>
         </div>` : '';

    postEl.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-center gap-3">
                ${renderTierCircle ? renderTierCircle(data.authorTier || 'citizen', data.reputation || 0) : '👤'}
                <div>
                    <p class="font-semibold">${data.author || 'Anonymous Witness'}</p>
                    <p class="text-xs text-zinc-500">${new Date(data.timestamp?.toDate?.() || data.timestamp).toLocaleString()}</p>
                </div>
            </div>
            <button onclick="showPostMenu('${id}', '${data.authorId}')" class="text-zinc-400 hover:text-white text-2xl transition">⋯</button>
        </div>

        ${data.content ? `<p class="mt-5 mb-4 text-zinc-100 leading-relaxed">${data.content}</p>` : ''}

        ${mediaHTML}
        ${audioHTML}

        <div class="flex items-center justify-between mt-6 pt-5 border-t border-zinc-700 text-sm">
            <div class="flex gap-6">
                <button onclick="likePost('${id}')" class="flex items-center gap-1.5 hover:text-emerald-400 transition">
                    👍 <span>${data.likes || 0}</span>
                </button>
                <button onclick="commentOnPost('${id}')" class="flex items-center gap-1.5 hover:text-sky-400 transition">
                    💬 <span>${data.commentsCount || 0}</span>
                </button>
            </div>
            <div class="flex gap-4">
                <button onclick="reportPost('${id}')" class="text-red-400 hover:text-red-500 transition">Report</button>
                <button onclick="sharePost('${id}')" class="text-emerald-400 hover:text-emerald-500 transition">Share</button>
            </div>
        </div>
    `;

    const container = document.getElementById('feedContainer');
    if (container) container.appendChild(postEl);
}

// Global helpers (keep for now)
window.reportPost = (postId) => import('./moderation.js').then(m => m.reportContent(postId, "other"));
window.likePost = (id) => showToast("Liked! Thank you for supporting truth.", "success");
window.commentOnPost = (id) => showToast("Comments coming soon – stay tuned", "info");
window.sharePost = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}?post=${id}`);
    showToast("Link copied to clipboard", "success");
};
window.showPostMenu = (postId, authorId) => showToast("Post options coming soon", "info");
