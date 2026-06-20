// js/feed.js
import { collection, query, orderBy, onSnapshot, where, limit, startAfter } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast, submitPeerVote } from './utils.js';

let activeFeedListener = null;
let lastDoc = null;
const feedContainer = document.getElementById('feedContainer');
const PAGE_SIZE = 15;

export function initFeed(db, currentFeed = 'citizen-talk') {
    if (activeFeedListener) activeFeedListener();
    
    feedContainer.innerHTML = '<div class="text-center py-8 text-zinc-400">Loading testimonies...</div>';
    lastDoc = null; // Reset pagination

    const q = query(
        collection(db, "testimonies"),
        where("feedVisibility", "==", currentFeed),
        orderBy("timestamp", "desc"),
        limit(PAGE_SIZE)
    );

    activeFeedListener = onSnapshot(q, (snapshot) => {
        if (!feedContainer) return;
        
        feedContainer.innerHTML = '';
        let hasRealPosts = false;

        snapshot.forEach((docSnap) => {
            hasRealPosts = true;
            renderPost(docSnap.id, docSnap.data());
            lastDoc = docSnap;   // Update for next page
        });

        if (!hasRealPosts) {
            const demoPosts = []; // Add your demo posts here if you still use them
            demoPosts.filter(p => p.feedVisibility === currentFeed)
                     .forEach(demo => renderPost(demo.id, demo, true));
        }

        // Show "Load More" button if there might be more posts
        if (snapshot.docs.length === PAGE_SIZE) {
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.className = "w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl mt-6 text-white font-medium transition";
            loadMoreBtn.textContent = "↓ Load More Testimonies";
            loadMoreBtn.onclick = () => loadMoreFeed(db, currentFeed);
            feedContainer.appendChild(loadMoreBtn);
        } else if (hasRealPosts) {
            const endMsg = document.createElement('div');
            endMsg.className = "text-center py-6 text-zinc-500 text-sm";
            endMsg.textContent = "🎉 You've reached the end";
            feedContainer.appendChild(endMsg);
        }
    });
}

async function loadMoreFeed(db, currentFeed) {
    if (!lastDoc) return;

    const loadMoreBtn = feedContainer.querySelector('button');
    if (loadMoreBtn) loadMoreBtn.textContent = "Loading more...";

    const q = query(
        collection(db, "testimonies"),
        where("feedVisibility", "==", currentFeed),
        orderBy("timestamp", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
    );

    const snapshot = await getSnapshotForLoadMore(q); // We'll import this

    if (snapshot.empty) {
        if (loadMoreBtn) loadMoreBtn.remove();
        return;
    }

    snapshot.forEach((docSnap) => {
        renderPost(docSnap.id, docSnap.data());
        lastDoc = docSnap;
    });

    // Re-add Load More button if needed
    if (snapshot.docs.length === PAGE_SIZE && loadMoreBtn) {
        loadMoreBtn.textContent = "↓ Load More Testimonies";
    } else if (loadMoreBtn) {
        loadMoreBtn.remove();
    }
}

// Helper for loadMore (since onSnapshot is already used)
import { getDocs } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

async function getSnapshotForLoadMore(q) {
    try {
        return await getDocs(q);
    } catch (err) {
        console.error("Load more failed:", err);
        return { empty: true, docs: [] };
    }
}

function renderPost(id, data, isDemo = false) {
    const postEl = document.createElement('div');
    postEl.className = `post-card glass rounded-3xl p-6 mb-4 ${isDemo ? 'opacity-75 border-dashed border-amber-500/30' : ''}`;

    let mediaHTML = '';
    if (data.imageUrl) {
        mediaHTML += `<img src="${data.imageUrl}" class="image-preview rounded-2xl mt-3 mb-4 w-full object-cover" alt="Evidence">`;
    }
    if (data.audioUrl) {
        mediaHTML += `<audio controls class="w-full mt-3 rounded-xl"><source src="${data.audioUrl}" type="audio/webm"></audio>`;
    }

    postEl.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-zinc-700 rounded-2xl flex items-center justify-center text-xl">👤</div>
                <div>
                    <p class="font-semibold">${data.author || 'Anonymous'}</p>
                    <p class="text-xs text-zinc-500">${new Date(data.timestamp).toLocaleString()}</p>
                </div>
            </div>
            ${isDemo ? `<span class="text-xs bg-amber-900/70 px-3 py-1 rounded-full">DEMO</span>` : ''}
        </div>
        ${data.content || data.witnessText ? `<p class="mb-4 text-zinc-100">${data.content || data.witnessText}</p>` : ''}
        ${mediaHTML}
        <div class="flex gap-3 mt-5">
            <button onclick="submitPeerVote('${id}', 'verify')" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-sm">✅ Verify (${data.moderation?.verificationsCount || 0})</button>
            <button onclick="submitPeerVote('${id}', 'dispute')" class="flex-1 py-3 bg-red-900/60 hover:bg-red-900 rounded-2xl text-sm">⚠️ Dispute (${data.moderation?.disputesCount || 0})</button>
        </div>
    `;
    feedContainer.appendChild(postEl);
}
