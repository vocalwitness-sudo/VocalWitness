// js/feed.js - FIXED
import {
    collection, query, orderBy, onSnapshot, where, limit
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { doc, updateDoc, increment, arrayUnion } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './firebase-config.js';
import { db } from './firebase-config.js';
import { showToast } from './utils.js';

let activeFeedListener = null;
let currentFeed = 'citizen-talk';

export function initFeed(dbInstance, feedType = 'citizen-talk') {
    currentFeed = feedType;
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    // Clean up previous listener
    if (activeFeedListener) {
        activeFeedListener();
        activeFeedListener = null;
    }

    feedContainer.innerHTML = '<div class="text-center py-8 text-zinc-400">Loading testimonies...</div>';

    // Use fallback for new feeds
    const effectiveFeed = (feedType === 'true-witness' || feedType === 'live') 
        ? 'citizen-talk' 
        : feedType;

    const q = query(
        collection(dbInstance, "testimonies"),
        where("feedVisibility", "==", effectiveFeed),
        orderBy("timestamp", "desc"),
        limit(15)
    );

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = '';
        let hasRealPosts = false;

        snapshot.forEach((docSnap) => {
            hasRealPosts = true;
            renderPost(docSnap.id, docSnap.data());
        });

        if (!hasRealPosts) {
            feedContainer.innerHTML = `
                <div class="text-center py-12 text-zinc-400">
                    <p class="text-4xl mb-4">🌍</p>
                    <p class="text-xl">No testimonies yet in this feed.</p>
                    <p class="text-sm mt-3">Be the first to share your voice!</p>
                </div>`;
        }
    }, (error) => {
        console.error("Feed loading error:", error);
        feedContainer.innerHTML = `
            <div class="text-center py-12 text-red-400">
                <p>Failed to load feed. Please check your connection.</p>
                <button onclick="window.loadFeed('${currentFeed}')"
                        class="mt-4 px-6 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl">
                    Retry
                </button>
            </div>`;
    });
}

function renderPost(id, data) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    const postEl = document.createElement('div');
    postEl.className = 'post-card glass rounded-3xl p-6 mb-6';

    let mediaHTML = '';
    if (data.imageUrl) {
        mediaHTML += `<img src="${data.imageUrl}" class="image-preview rounded-2xl mt-3 mb-4 w-full object-cover max-h-96" alt="Evidence">`;
    }
    if (data.audioUrl) {
        mediaHTML += `<audio controls class="w-full mt-3 rounded-xl"><source src="${data.audioUrl}" type="audio/webm"></audio>`;
    }

    postEl.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-zinc-700 rounded-2xl flex items-center justify-center text-xl">👤</div>
                <div>
                    <p class="font-semibold">${data.author || 'Anonymous Witness'}</p>
                    <p class="text-xs text-zinc-500">${new Date(data.timestamp || data.createdAt).toLocaleString()}</p>
                </div>
            </div>
            <button onclick="pinPost('${id}')" class="text-2xl hover:scale-110 transition-transform">📌</button>
        </div>
        ${data.content ? `<p class="mb-4 text-zinc-100 leading-relaxed">${data.content}</p>` : ''}
        ${mediaHTML}
        <div class="flex items-center justify-between mt-6 pt-4 border-t border-zinc-700">
            <div class="flex gap-3">
                <button onclick="likePost('${id}')" class="flex items-center gap-2 px-5 py-2 hover:bg-zinc-800 rounded-2xl transition-all text-emerald-400">
                    👍 <span id="like-count-${id}">${data.likes || 0}</span>
                </button>
                <button onclick="disputePost('${id}')" class="flex items-center gap-2 px-5 py-2 hover:bg-zinc-800 rounded-2xl transition-all text-red-400">
                    ⚠️ <span>${data.disputes || 0}</span>
                </button>
            </div>
            <div class="flex gap-3">
                <button onclick="sharePost('${id}')" class="px-5 py-2 hover:bg-zinc-800 rounded-2xl transition-all">🔗 Share</button>
                <button onclick="editPost('${id}')" class="px-5 py-2 hover:bg-zinc-800 rounded-2xl transition-all">✏️ Edit</button>
            </div>
        </div>
    `;

    feedContainer.appendChild(postEl);
}

// Re-apply tier after auth
document.addEventListener('auth-changed', async (e) => {
    if (e.detail.user) {
        const tier = await getCurrentUserTier();
        applyTierTheme(tier);
        window.currentUserTier = tier;
    }
});
// Global actions
window.likePost = async function(postId) {
    if (!auth.currentUser) {
        showToast("Please sign in to like posts", "error");
        return;
    }
    try {
        const postRef = doc(db, "testimonies", postId);
        await updateDoc(postRef, {
            likes: increment(1),
            likedBy: arrayUnion(auth.currentUser.uid)
        });
        showToast("✅ Upvoted!", "success");
    } catch (error) {
        console.error("Like failed:", error);
        showToast("Could not like post", "error");
    }
};

window.disputePost = async function(postId) {
    if (!auth.currentUser) {
        showToast("Please sign in to dispute", "error");
        return;
    }
    try {
        const postRef = doc(db, "testimonies", postId);
        await updateDoc(postRef, {
            disputes: increment(1),
            disputedBy: arrayUnion(auth.currentUser.uid)
        });
        showToast("⚠️ Dispute submitted", "info");
    } catch (error) {
        console.error("Dispute failed:", error);
        showToast("Could not submit dispute", "error");
    }
};

window.sharePost = function(postId) {
    const url = `${window.location.origin}/?post=${postId}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast("🔗 Link copied!", "success");
    });
};

window.pinPost = function(postId) {
    showToast("📌 Post pinned (feature coming soon)", "info");
};

window.editPost = function(postId) {
    showToast("✏️ Edit feature coming soon", "info");
};
window.escalatePost = async function(postId) {
    await escalatePost(postId);   // from tier.js
};
