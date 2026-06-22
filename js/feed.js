// js/feed.js - Full Pagination + Load More + i18n Support
import {
    collection, query, orderBy, onSnapshot, where, limit, startAfter, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';

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
            feedContainer.innerHTML = `
                <div class="text-center py-12 text-zinc-400">
                    <p class="text-2xl mb-2">🌍</p>
                    <p>No testimonies yet in this feed.</p>
                    <p class="text-sm mt-2">Be the first to share!</p>
                </div>`;
        }

        if (snapshot.docs.length === PAGE_SIZE) {
            addLoadMoreButton(db, currentFeed);
        } else if (hasRealPosts) {
            addEndMessage();
        }
    });
}

async function switchFeed(feedType) {
    currentFeed = feedType; // e.g., 'witness-voice' or 'citizen-talk'
    console.log(`Switching to: ${currentFeed}`);
    
    // 1. Clear current feed
    const container = document.getElementById('feedContainer');
    container.innerHTML = '<p>Loading testimonies...</p>';
    
    // 2. Fetch data from Firestore based on the feed
    // This assumes you have a 'feedVisibility' field in your 'testimonies' collection
    await initFeed(db, currentFeed); 
}


function addLoadMoreButton(db, currentFeed) {
    const btn = document.createElement('button');
    btn.className = "w-full py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl mt-6 text-white font-medium transition";
    btn.textContent = "↓ Load More Testimonies";
    btn.onclick = () => loadMoreFeed(db, currentFeed, btn);
    feedContainer.appendChild(btn);
}

function addEndMessage() {
    const msg = document.createElement('div');
    msg.className = "text-center py-8 text-zinc-500 text-sm";
    msg.textContent = "🎉 You've reached the end of the feed";
    feedContainer.appendChild(msg);
}

async function loadMoreFeed(db, currentFeed, btn) {
    if (!lastDoc) return;

    btn.textContent = "Loading...";
    btn.disabled = true;

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
            btn.disabled = false;
        } else {
            btn.remove();
            addEndMessage();
        }
    } catch (err) {
        console.error("Load more error:", err);
        btn.textContent = "Error loading more";
    }
}

function renderPost(id, data) {
    const postEl = document.createElement('div');
    postEl.className = 'post-card glass rounded-3xl p-6 mb-4';

    let mediaHTML = '';
    if (data.mediaURL || data.imageUrl) {
        mediaHTML += `<img src="${data.mediaURL || data.imageUrl}" class="image-preview rounded-2xl mt-3 mb-4 w-full object-cover" alt="Evidence">`;
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
                    <p class="font-semibold">${data.author || 'Anonymous'}</p>
                    <p class="text-xs text-zinc-500">${new Date(data.timestamp || data.createdAt).toLocaleString()}</p>
                </div>
            </div>
            ${data.pinnedBy ? `<span class="text-amber-400 text-sm">📌 Pinned</span>` : ''}
        </div>

        ${data.content ? `<p class="mb-4 text-zinc-100 leading-relaxed">${data.content}</p>` : ''}

        ${mediaHTML}

        <div class="flex gap-3 mt-5">
            <button onclick="submitPeerVote('${id}', 'verify')" 
                    class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl text-sm font-medium transition">
                ✅ Verify
            </button>
            <button onclick="submitPeerVote('${id}', 'dispute')" 
                    class="flex-1 py-3 bg-red-900/60 hover:bg-red-900 rounded-2xl text-sm font-medium transition">
                ⚠️ Dispute
            </button>
        </div>
    `;

    feedContainer.appendChild(postEl);
}
