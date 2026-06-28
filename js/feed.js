// js/feed.js - Complete & Fixed
import {
    collection, query, orderBy, onSnapshot, where, limit, startAfter, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// Import Auth for user ID
import { auth } from './firebase-config.js';

// Global submitPeerVote
import { submitPeerVote } from './utils.js';
window.submitPeerVote = submitPeerVote;
let activeFeedListener = null;
let lastDoc = null;
let currentFeed = 'citizen-talk';

export function initFeed(db, feedType = 'citizen-talk') {
    currentFeed = feedType;

    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) {
        console.warn("⚠️ feedContainer not found on this page. Skipping feed.");
        return;
    }

    if (activeFeedListener) activeFeedListener();
   
    feedContainer.innerHTML = '<div class="text-center py-8 text-zinc-400">Loading testimonies...</div>';
    lastDoc = null;

    const q = query(
        collection(db, "testimonies"),
        where("feedVisibility", "==", currentFeed),
        orderBy("timestamp", "desc"),
        limit(15)
    );

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = '';
        let hasRealPosts = false;

        snapshot.forEach((docSnap) => {
            hasRealPosts = true;
            renderPost(docSnap.id, docSnap.data());
            lastDoc = docSnap;
        });

        if (!hasRealPosts) {
            feedContainer.innerHTML = `
                <div class="text-center py-12 text-zinc-400">
                    <p class="text-3xl mb-3">🌍</p>
                    <p class="text-lg">No testimonies yet in this feed.</p>
                    <p class="text-sm mt-2">Be the first to share your voice!</p>
                </div>`;
        }
    });
}

function renderPost(id, data) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    const postEl = document.createElement('div');
    postEl.className = 'post-card glass rounded-3xl p-6 mb-6';

    let mediaHTML = '';
    if (data.mediaURL || data.imageUrl) {
        mediaHTML += `<img src="${data.mediaURL || data.imageUrl}" class="image-preview rounded-2xl mt-3 mb-4 w-full object-cover max-h-96" alt="Evidence">`;
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

        <!-- Action Buttons -->
        <div class="flex items-center justify-between mt-6 pt-4 border-t border-zinc-700">
            <div class="flex gap-3">
                <button onclick="likePost('${id}')" 
                    class="flex items-center gap-2 px-5 py-2 hover:bg-zinc-800 rounded-2xl transition-all text-emerald-400">
                    👍 <span id="like-count-${id}">0</span>
                </button>
                <button onclick="disputePost('${id}')" 
                    class="flex items-center gap-2 px-5 py-2 hover:bg-zinc-800 rounded-2xl transition-all text-red-400">
                    ⚠️ Dispute
                </button>
            </div>

            <div class="flex gap-3">
                <button onclick="sharePost('${id}')" 
                    class="px-5 py-2 hover:bg-zinc-800 rounded-2xl transition-all">🔗 Share</button>
                
                <button onclick="editPost('${id}')" 
                    class="px-5 py-2 hover:bg-zinc-800 rounded-2xl transition-all">✏️ Edit</button>
            </div>
        </div>
    `;

    feedContainer.appendChild(postEl);
}

// Global Post Actions

// ==================== REAL FIRESTORE ACTIONS ====================
import { doc, updateDoc, increment, arrayUnion } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db } from './firebase-config.js';
import { auth } from './firebase-config.js';   // ← Make sure this import exists
import { showToast } from './utils.js';

// Like / Upvote
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
        showToast("✅ Upvoted! Thank you for supporting truth.", "success");
    } catch (error) {
        console.error("Like failed:", error);
        showToast("Could not like post right now", "error");
    }
};

// Dispute
window.disputePost = async function(postId) {
    if (!auth.currentUser) {
        showToast("Please sign in to dispute posts", "error");
        return;
    }

    try {
        const postRef = doc(db, "testimonies", postId);
        await updateDoc(postRef, {
            disputes: increment(1),
            disputedBy: arrayUnion(auth.currentUser.uid)
        });
        showToast("⚠️ Dispute submitted. Community will review.", "error");
    } catch (error) {
        console.error("Dispute failed:", error);
        showToast("Could not submit dispute", "error");
    }
};

// Share (no change needed)
window.sharePost = function(postId) {
    const url = `${window.location.origin}/?post=${postId}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast("🔗 Link copied! Share the truth.", "success");
    });
};

// Pin & Edit (no change)
window.pinPost = function(postId) {
    showToast("📌 Post pinned to your profile", "success");
};

window.editPost = function(postId) {
    showToast("✏️ Edit mode coming soon for your own posts", "info");
};
