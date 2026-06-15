// js/feed.js
import { collection, query, orderBy, onSnapshot, where } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast, submitPeerVote } from './utils.js';

let activeFeedListener = null;
const feedContainer = document.getElementById('feedContainer');
const optimisticPosts = new Set();

const demoPosts = [ /* keep your existing demo posts */ ];

export function initFeed(db, currentFeed = 'citizen-talk') {
    if (activeFeedListener) activeFeedListener();

    const q = query(collection(db, "testimonies"), 
        where("feedVisibility", "==", currentFeed),
        orderBy("timestamp", "desc")
    );

    activeFeedListener = onSnapshot(q, (snapshot) => {
        if (!feedContainer) return;
        feedContainer.innerHTML = '';

        let hasRealPosts = false;

        snapshot.forEach((docSnap) => {
            hasRealPosts = true;
            renderPost(docSnap.id, docSnap.data());
        });

        if (!hasRealPosts) {
            const filtered = demoPosts.filter(p => p.feedVisibility === currentFeed);
            filtered.forEach(demo => renderPost(demo.id, demo, true));
        }
    });
}

function renderPost(id, data, isDemo = false) {
    const postEl = document.createElement('div');
    postEl.className = `post-card glass rounded-3xl p-6 mb-4 ${isDemo ? 'opacity-75 border-dashed border-amber-500/30' : ''}`;

    let mediaHTML = '';
    if (data.imageUrl) {
        mediaHTML += `<img src="${data.imageUrl}" class="image-preview rounded-2xl mt-3 mb-4 w-full" alt="Evidence">`;
    }
    if (data.audioUrl) {
        mediaHTML += `
            <audio controls class="w-full mt-3 rounded-xl">
                <source src="${data.audioUrl}" type="audio/webm">
            </audio>`;
    }

    postEl.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-zinc-700 rounded-2xl flex items-center justify-center text-xl">👤</div>
                <div>
                    <p class="font-semibold">${data.authorId || 'Anonymous'}</p>
                    <p class="text-xs text-zinc-500">${new Date(data.timestamp).toLocaleString()}</p>
                </div>
            </div>
            ${isDemo ? `<span class="text-xs bg-amber-900/70 px-3 py-1 rounded-full">DEMO</span>` : ''}
        </div>

        ${data.witnessText ? `<p class="mb-4 text-zinc-100">${data.witnessText}</p>` : ''}
        ${mediaHTML}

        <div class="flex gap-3 mt-5">
            <button onclick="submitPeerVote('${id}', 'verify')" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl">✅ Verify (${data.moderation?.verificationsCount || 0})</button>
            <button onclick="submitPeerVote('${id}', 'dispute')" class="flex-1 py-3 bg-red-900/60 hover:bg-red-900 rounded-2xl">⚠️ Dispute (${data.moderation?.disputesCount || 0})</button>
        </div>
    `;
    feedContainer.appendChild(postEl);
}

export function addPostToFeed(postData, isOptimistic = false) {
    // ... (keep your existing optimistic UI)
}
