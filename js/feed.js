// js/feed.js - Updated with Escalation
import {
    collection, query, orderBy, onSnapshot, where, limit, doc, updateDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

import { auth, db } from './firebase-config.js';
import { showToast } from './utils.js';
import { getCurrentUserTier, canAccessFeature } from './tier.js';

let activeFeedListener = null;

export function initFeed(dbInstance, feedType = 'citizen-talk') {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    if (activeFeedListener) {
        activeFeedListener();
        activeFeedListener = null;
    }

    feedContainer.innerHTML = '<div class="text-center py-8 text-zinc-400">Loading testimonies...</div>';

    const effectiveFeed = (feedType === 'true-witness' || feedType === 'live') ? 'citizen-talk' : feedType;

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
                </div>`;
        }
    }, (error) => {
        console.error("Feed error:", error);
        feedContainer.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load feed. Please refresh.</div>`;
    });
}

async function renderPost(id, data) {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    const postEl = document.createElement('div');
    postEl.className = 'post-card glass rounded-3xl p-6 mb-6';

    let mediaHTML = '';
    if (data.imageUrl) mediaHTML += `<img src="${data.imageUrl}" class="rounded-2xl mt-3 mb-4 w-full object-cover max-h-96" alt="Evidence">`;
    if (data.audioUrl) mediaHTML += `<audio controls class="w-full mt-3"><source src="${data.audioUrl}" type="audio/webm"></audio>`;

    const isEscalated = data.status === 'escalated' || data.status === 'verified';

    postEl.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-zinc-700 rounded-2xl flex items-center justify-center text-xl">👤</div>
                <div>
                    <p class="font-semibold">${data.author || 'Anonymous Witness'}</p>
                    <p class="text-xs text-zinc-500">${new Date(data.timestamp).toLocaleString()}</p>
                </div>
            </div>
            ${isEscalated ? `<span class="text-emerald-400 text-sm font-medium">🔬 True Witness</span>` : ''}
        </div>

        ${data.content ? `<p class="mb-4 text-zinc-100 leading-relaxed">${data.content}</p>` : ''}
        ${mediaHTML}

        <div class="flex flex-wrap gap-2 mt-6 pt-4 border-t border-zinc-700">
            <button onclick="likePost('${id}')" class="flex items-center gap-2 px-5 py-2 hover:bg-zinc-800 rounded-2xl text-emerald-400">
                👍 <span>${data.likes || 0}</span>
            </button>
            <button onclick="disputePost('${id}')" class="flex items-center gap-2 px-5 py-2 hover:bg-zinc-800 rounded-2xl text-red-400">
                ⚠️ <span>${data.disputes || 0}</span>
            </button>
            
            ${!isEscalated ? `
            <button onclick="escalatePost('${id}')" 
                    class="ml-auto px-5 py-2 bg-amber-500 hover:bg-amber-600 text-black font-medium rounded-2xl transition-all">
                ⬆️ Escalate to True Witness
            </button>` : ''}
            
            <button onclick="sharePost('${id}')" class="px-5 py-2 hover:bg-zinc-800 rounded-2xl">🔗 Share</button>
        </div>
    `;

    feedContainer.appendChild(postEl);
}

// ====================== ESCALATION ======================
window.escalatePost = async function(postId) {
    if (!auth.currentUser) {
        showToast("Sign in to escalate posts", "error");
        return;
    }

    const tier = await getCurrentUserTier();
    if (!canAccessFeature(tier, 'escalate_post')) {
        showToast("Phone verification required to escalate", "error");
        return;
    }

    try {
        const postRef = doc(db, "testimonies", postId);
        await updateDoc(postRef, {
            status: "escalated",
            escalatedAt: new Date().toISOString(),
            escalatedBy: auth.currentUser.uid
        });

        showToast("🔬 Post escalated to True Witness!", "success");
        
        // Refresh current feed
        setTimeout(() => window.loadFeed('citizen-talk'), 800);
    } catch (err) {
        console.error("Escalation failed:", err);
        showToast("Could not escalate post", "error");
    }
};

// Stub functions (keep your existing ones)
window.likePost = async function(postId) { /* your existing code */ };
window.disputePost = async function(postId) { /* your existing code */ };
window.sharePost = function(postId) { /* your existing code */ };
