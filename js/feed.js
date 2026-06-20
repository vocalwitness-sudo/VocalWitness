// js/feed.js - Full Pagination + Load More
import { 
    collection, query, orderBy, onSnapshot, where, limit, startAfter, getDocs 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast, submitPeerVote } from './utils.js';

let activeFeedListener = null;
let lastDoc = null;
const feedContainer = document.getElementById('feedContainer');
const PAGE_SIZE = 15;

export function initFeed(db, currentFeed = 'citizen-talk') {
    if (activeFeedListener) activeFeedListener();
    feedContainer.innerHTML = '<div class="text-center py-8 text-zinc-400">Loading testimonies...</div>';
    lastDoc = null;

    const q = query(
        collection(db, "testimonies"),
        where("feedVisibility", "==", currentFeed),
        orderBy("timestamp", "desc"),
        limit(PAGE_SIZE)
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
            // Demo fallback
            const demoPosts = []; // populate if needed
            demoPosts.filter(p => p.feedVisibility === currentFeed)
                     .forEach(demo => renderPost(demo.id, demo, true));
        }

        if (snapshot.docs.length === PAGE_SIZE) {
            addLoadMoreButton(db, currentFeed);
        } else if (hasRealPosts) {
            addEndMessage();
        }
    });
}

function addLoadMoreButton(db, currentFeed) {
    const btn = document.createElement('button');
    btn.className = "w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl mt-6 text-white font-medium";
    btn.textContent = "↓ Load More Testimonies";
    btn.onclick = () => loadMoreFeed(db, currentFeed, btn);
    feedContainer.appendChild(btn);
}

function addEndMessage() {
    const msg = document.createElement('div');
    msg.className = "text-center py-8 text-zinc-500";
    msg.textContent = "🎉 End of feed";
    feedContainer.appendChild(msg);
}

async function loadMoreFeed(db, currentFeed, btn) {
    if (!lastDoc) return;
    btn.textContent = "Loading...";

    const q = query(
        collection(db, "testimonies"),
        where("feedVisibility", "==", currentFeed),
        orderBy("timestamp", "desc"),
        startAfter(lastDoc),
        limit(PAGE_SIZE)
    );

    try {
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
            btn.remove();
            return;
        }

        snapshot.forEach((docSnap) => {
            renderPost(docSnap.id, docSnap.data());
            lastDoc = docSnap;
        });

        if (snapshot.docs.length === PAGE_SIZE) {
            btn.textContent = "↓ Load More Testimonies";
        } else {
            btn.remove();
            addEndMessage();
        }
    } catch (err) {
        console.error("Load more error:", err);
        btn.textContent = "Error loading more";
    }
}

function renderPost(id, data, isDemo = false) {
    const postEl = document.createElement('div');
    postEl.className = `post-card glass rounded-3xl p-6 mb-4 ${isDemo ? 'opacity-75 border-dashed border-amber-500/30' : ''}`;

    let mediaHTML = '';
    if (data.imageUrl) mediaHTML += `<img src="${data.imageUrl}" class="image-preview rounded-2xl mt-3 mb-4 w-full object-cover" alt="Evidence">`;
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
            <button onclick="submitPeerVote('${id}', 'verify')" class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-sm">✅ Verify</button>
            <button onclick="submitPeerVote('${id}', 'dispute')" class="flex-1 py-3 bg-red-900/60 hover:bg-red-900 rounded-2xl text-sm">⚠️ Dispute</button>
        </div>
    `;
    feedContainer.appendChild(postEl);
}
