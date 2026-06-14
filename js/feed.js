// js/feed.js
import { collection, query, orderBy, onSnapshot, where } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast, submitPeerVote } from './utils.js';

let activeFeedListener = null;
const feedContainer = document.getElementById('feedContainer');
const optimisticPosts = new Set();

export function initFeed(db, currentFeed = 'citizen-talk') {
    if (activeFeedListener) activeFeedListener();

    const q = query(
        collection(db, "testimonies"),
        where("feedVisibility", "==", currentFeed),
        orderBy("timestamp", "desc")
    );

    activeFeedListener = onSnapshot(q, (snapshot) => {
        if (!feedContainer) return;
        feedContainer.innerHTML = '';

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (optimisticPosts.has(docSnap.id)) return;

            const postEl = document.createElement('div');
            postEl.className = `post-card glass rounded-3xl p-6 mb-4 border border-emerald-900/30`;
            postEl.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 bg-zinc-700 rounded-2xl flex items-center justify-center text-xl">👤</div>
                        <div>
                            <p class="font-semibold text-white">${data.authorId?.slice(0,8) || 'Anonymous'}</p>
                            <p class="text-xs text-zinc-500">${new Date(data.timestamp).toLocaleString()}</p>
                        </div>
                    </div>
                    <span class="text-xs px-3 py-1 rounded-full bg-emerald-900/60">${data.languageCode?.toUpperCase() || 'EN'}</span>
                </div>

                ${data.witnessText ? `<p class="mb-5 leading-relaxed text-zinc-100">${data.witnessText}</p>` : ''}
                
                ${data.audioUrl ? `
                    <audio controls class="w-full mb-5 rounded-xl">
                        <source src="${data.audioUrl}" type="audio/webm">
                    </audio>
                ` : ''}

                <div class="flex gap-3">
                    <button onclick="submitPeerVote('${docSnap.id}', 'verify')" 
                            class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-medium transition">
                        ✅ Verify (${data.moderation?.verificationsCount || 0})
                    </button>
                    <button onclick="submitPeerVote('${docSnap.id}', 'dispute')" 
                            class="flex-1 py-3 bg-red-900/60 hover:bg-red-900 rounded-2xl font-medium transition">
                        ⚠️ Dispute (${data.moderation?.disputesCount || 0})
                    </button>
                </div>
            `;
            feedContainer.appendChild(postEl);
        });
    });
}

export function addPostToFeed(postData, isOptimistic = false) {
    if (!feedContainer) return;
    const post = document.createElement('div');
    post.id = postData.id;
    post.className = `post-card glass rounded-3xl p-6 mb-4 border border-emerald-900/30 ${isOptimistic ? 'opacity-70' : ''}`;
    post.innerHTML = `
        <p class="text-zinc-200">${postData.witnessText || ''}</p>
        <small class="text-emerald-400">${isOptimistic ? 'Syncing to ledger...' : '✓ On-chain'}</small>
    `;
    feedContainer.prepend(post);
    if (isOptimistic) optimisticPosts.add(postData.id);
}
