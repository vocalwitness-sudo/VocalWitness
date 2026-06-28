// js/feed.js - Complete & Fixed
import {
    collection, query, orderBy, onSnapshot, where, limit, startAfter, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast, submitPeerVote } from './utils.js';

let activeFeedListener = null;
let lastDoc = null;
let currentFeed = 'citizen-talk';

function initFeed(db, feedType = 'citizen-talk') {
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
    postEl.className = 'post-card glass rounded-3xl p-6 mb-4';
   
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
        </div>
        ${data.content ? `<p class="mb-4 text-zinc-100 leading-relaxed">${data.content}</p>` : ''}
        ${mediaHTML}
        <div class="flex gap-3 mt-5">
            <button onclick="window.submitPeerVote('${id}', 'verify')" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-sm font-medium">✅ Verify</button>
            <button onclick="window.submitPeerVote('${id}', 'dispute')" class="flex-1 py-3 bg-red-900/70 hover:bg-red-900 rounded-2xl text-sm font-medium">⚠️ Dispute</button>
        </div>
    `;
    feedContainer.appendChild(postEl);
}

export { initFeed };
