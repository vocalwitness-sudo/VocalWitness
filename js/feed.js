// js/feed.js
import { collection, query, orderBy, onSnapshot, where } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast, submitPeerVote } from './utils.js';

let activeFeedListener = null;
const feedContainer = document.getElementById('feedContainer');
const optimisticPosts = new Set();

const demoPosts = [
    {
        id: "demo-1",
        authorId: "NigerianWitness",
        witnessText: "I saw heavy police presence at the Lekki toll gate this morning. Traffic is chaotic. Stay safe.",
        timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
        languageCode: "en",
        feedVisibility: "citizen-talk",
        moderation: { verificationsCount: 12, disputesCount: 2 }
    },
    {
        id: "demo-2",
        authorId: "StreetVoiceHA",
        witnessText: "An accident just happened near Kano Central Mosque. Two vehicles involved. Emergency services on the way.",
        timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        languageCode: "ha",
        feedVisibility: "citizen-talk",
        moderation: { verificationsCount: 8, disputesCount: 1 }
    },
    {
        id: "demo-3",
        authorId: "ForensicEye",
        witnessText: "Audio evidence of bribery attempt recorded in Lagos. Will upload full testimony after verification.",
        timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
        languageCode: "en",
        feedVisibility: "witness-voice",
        moderation: { verificationsCount: 24, disputesCount: 0 }
    }
];

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

        let hasRealPosts = false;

        snapshot.forEach((docSnap) => {
            hasRealPosts = true;
            const data = docSnap.data();
            if (optimisticPosts.has(docSnap.id)) return;
            renderPost(docSnap.id, data);
        });

        // Show demo posts only if no real content exists
        if (!hasRealPosts) {
            const filteredDemos = demoPosts.filter(p => p.feedVisibility === currentFeed);
            if (filteredDemos.length === 0) {
                filteredDemos.push(...demoPosts); // fallback
            }
            filteredDemos.forEach(demo => {
                renderPost(demo.id, demo, true);
            });
            showToast("🌱 Demo content loaded (Real posts will replace these)", "success");
        }
    });
}

function renderPost(id, data, isDemo = false) {
    const postEl = document.createElement('div');
    postEl.className = `post-card glass rounded-3xl p-6 mb-4 border border-emerald-900/30 ${isDemo ? 'opacity-75 border-dashed border-amber-500/30' : ''}`;
    
    postEl.innerHTML = `
        <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
                <div class="w-9 h-9 bg-zinc-700 rounded-2xl flex items-center justify-center text-xl">👤</div>
                <div>
                    <p class="font-semibold text-white">${data.authorId || 'Anonymous'}</p>
                    <p class="text-xs text-zinc-500">${new Date(data.timestamp).toLocaleString()}</p>
                </div>
            </div>
            ${isDemo ? `<span class="text-[10px] px-2 py-1 bg-amber-900/60 text-amber-400 rounded-full">DEMO</span>` : ''}
            <span class="text-xs px-3 py-1 rounded-full bg-emerald-900/60">${data.languageCode?.toUpperCase() || 'EN'}</span>
        </div>

        <p class="mb-5 leading-relaxed text-zinc-100">${data.witnessText}</p>
        
        ${data.audioUrl ? `
            <audio controls class="w-full mb-5 rounded-xl">
                <source src="${data.audioUrl}" type="audio/webm">
            </audio>
        ` : ''}

        <div class="flex gap-3">
            <button onclick="submitPeerVote('${id}', 'verify')" 
                    class="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 rounded-2xl font-medium transition">
                ✅ Verify (${data.moderation?.verificationsCount || 0})
            </button>
            <button onclick="submitPeerVote('${id}', 'dispute')" 
                    class="flex-1 py-3 bg-red-900/60 hover:bg-red-900 rounded-2xl font-medium transition">
                ⚠️ Dispute (${data.moderation?.disputesCount || 0})
            </button>
        </div>
    `;
    feedContainer.appendChild(postEl);
}

export function addPostToFeed(postData, isOptimistic = false) {
    if (!feedContainer) return;
    const post = document.createElement('div');
    post.id = postData.id;
    post.className = `post-card glass rounded-3xl p-6 mb-4 border border-emerald-900/30 ${isOptimistic ? 'opacity-70' : ''}`;
    post.innerHTML = `
        <p class="text-zinc-200">${postData.witnessText || ''}</p>
        <small class="text-emerald-400">${isOptimistic ? 'Syncing...' : '✓ On-chain'}</small>
    `;
    feedContainer.prepend(post);
    if (isOptimistic) optimisticPosts.add(postData.id);
}
