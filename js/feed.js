// js/feed.js - Polished Public Square Feed
import { collection, query, onSnapshot, limit } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { showToast } from './utils.js';
import { renderTierCircle } from './ui-components.js';

let activeFeedListener = null;

export function initFeed(dbInstance = db) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    // Clean up old listener to avoid memory leaks
    if (activeFeedListener) activeFeedListener();

    feedContainer.innerHTML = `
        <div class="text-center py-12">
            <div class="animate-pulse text-zinc-400">Loading testimonies from the Square...</div>
        </div>`;

    // Query posts with limit only (no orderBy to prevent index/permission crashes)
    const q = query(
        collection(dbInstance, "posts"),
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

        // Map and sort documents locally in memory
        const posts = [];
        snapshot.forEach((docSnap) => {
            posts.push({ id: docSnap.id, ...docSnap.data() });
        });

        posts.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
            return timeB - timeA; // Descending order (newest first)
        });

        posts.forEach((post) => renderPost(post.id, post));
    }, (error) => {
        console.error("Feed error:", error);
        feedContainer.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load feed. Check your connection or Firestore rules.</div>`;
    });
}

function renderPost(id, data) {
    if (data.moderationStatus === "removed") return;

    const postEl = document.createElement('div');
    postEl.className = 'glass rounded-3xl p-6 mb-6 hover:border-emerald-500/30 transition-all duration-300 border border-zinc-800 bg-zinc-900/50';

    const mediaHTML = data.imageUrl ? 
        `<img src="${data.imageUrl}" class="mt-5 rounded-2xl w-full max-h-96 object-cover border border-zinc-700" alt="Evidence">` : '';

    const audioHTML = data.audioUrl ? 
        `<div class="mt-5 bg-zinc-900 rounded-2xl p-4 border border-zinc-700">
            <audio controls class="w-full"><source src="${data.audioUrl}" type="audio/webm"></audio>
         </div>` : '';

    const hashHTML = data.forensicHash ?
        `<div class="mt-3 text-[10px] font-mono text-zinc-500 truncate" title="SHA-256 Hash: ${data.forensicHash}">
            🔒 Hash: ${data.forensicHash}
         </div>` : '';

    let formattedDate = "Just now";
    if (data.createdAt?.toDate) {
        formattedDate = data.createdAt.toDate().toLocaleString();
    } else if (data.createdAt) {
        formattedDate = new Date(data.createdAt).toLocaleString();
    }

    const authorDisplayName = data.author || (data.authorId ? `Witness (${data.authorId.substring(0, 6)}...)` : 'Anonymous Witness');

    postEl.innerHTML = `
        <div class="flex justify-between items-start">
            <div class="flex items-center gap-3">
                ${renderTierCircle ? renderTierCircle(data.authorTier || 'citizen', data.reputation || 0) : '<span class="text-2xl">👤</span>'}
                <div>
                    <p class="font-semibold text-zinc-100">${authorDisplayName}</p>
                    <p class="text-xs text-zinc-500">${formattedDate}</p>
                </div>
            </div>
            <button onclick="showPostMenu('${id}', '${data.authorId}')" class="text-zinc-400 hover:text-white text-2xl transition">⋯</button>
        </div>

        ${data.content ? `<p class="mt-5 mb-4 text-zinc-100 leading-relaxed">${data.content}</p>` : ''}

        ${mediaHTML}
        ${audioHTML}
        ${hashHTML}

        <div class="flex items-center justify-between mt-6 pt-5 border-t border-zinc-800 text-sm">
            <div class="flex gap-6">
                <button onclick="likePost('${id}')" class="flex items-center gap-1.5 hover:text-emerald-400 transition text-zinc-400">
                    👍 <span>${data.likes || 0}</span>
                </button>
                <button onclick="commentOnPost('${id}')" class="flex items-center gap-1.5 hover:text-sky-400 transition text-zinc-400">
                    💬 <span>${data.commentsCount || 0}</span>
                </button>
            </div>
            <div class="flex gap-4">
                <button onclick="reportPost('${id}')" class="text-red-400 hover:text-red-500 transition text-xs">Report</button>
                <button onclick="sharePost('${id}')" class="text-emerald-400 hover:text-emerald-500 transition text-xs">Share</button>
            </div>
        </div>
    `;

    const container = document.getElementById('feedContainer');
    if (container) container.appendChild(postEl);
}

// Global actions for onclick triggers in template strings
window.reportPost = (postId) => {
    import('./moderation.js').then(m => m.reportContent(postId, "other")).catch(() => {
        showToast("Moderation module loading...", "info");
    });
};
window.likePost = (id) => showToast("Liked! Thank you for supporting truth.", "success");
window.commentOnPost = (id) => showToast("Comments coming soon – stay tuned", "info");
window.sharePost = (id) => {
    navigator.clipboard.writeText(`${window.location.origin}?post=${id}`);
    showToast("Link copied to clipboard", "success");
};
window.showPostMenu = (postId, authorId) => showToast("Post options coming soon", "info");

// Auto-initialize feed on load if feedContainer exists
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initFeed());
} else {
    initFeed();
}
