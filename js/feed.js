// js/feed.js
import { db } from "./firebase-config.js";
import { collection, query, orderBy, onSnapshot, where, doc, updateDoc, increment, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { currentUser } from "./auth.js";
import { showToast } from "./utils.js";
// Inside js/feed.js
import { state } from './storage.js';

export async function postNow() {
    const feedType = currentFeed; // 'vocal-truth' or 'citizen-talk'
    
    // The Gatekeeper: Strict logic for the Forensic Office
    if (feedType === 'vocal-truth' && !state.isVerified) {
        return showToast("⚠️ Forensic Access requires Tier 1 Verification.");
    }

    // Proceed with standard upload logic...
}

const feedContainer = document.getElementById('feed');
let activeFeedListener = null;

// Track optimistic posts
const optimisticPosts = new Set();

export function addPostToFeed(postData, isOptimistic = false) {
    const post = document.createElement('div');
    post.id = postData.id;
    post.className = `witness-card glass rounded-3xl p-5 border border-zinc-900 bg-[#090f1d]/40 ${isOptimistic ? 'opacity-60' : ''}`;
    post.innerHTML = `<p>${postData.witnessText}</p><small>${isOptimistic ? 'Syncing...' : 'Verified'}</small>`;
    
    feedContainer.prepend(post);
    if (isOptimistic) optimisticPosts.add(postData.id);
}

/**
 * Scalable Voting (Sub-collection pattern)
 */
export async function submitPeerVote(postId, action = 'verify') {
    if (!currentUser) return showToast("Must be logged in.");

    const postRef = doc(db, "testimonies", postId);
    const voteRef = doc(db, "testimonies", postId, "votes", currentUser.uid);

    try {
        await setDoc(voteRef, { voteType: action, timestamp: new Date() });
        await updateDoc(postRef, {
            "moderation.verificationsCount": increment(1)
        });
        showToast("✅ Vote recorded.");
    } catch (e) {
        showToast("Vote failed.");
    }
}

/**
 * Real-time ledger synchronization
 */
export function listenToLedgerFeed(currentFeed) {
    if (activeFeedListener) activeFeedListener();

    const q = query(collection(db, "testimonies"), where("feedType", "==", currentFeed), orderBy("timestamp", "desc"));

    activeFeedListener = onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = '';
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // Skip rendering if it's already in the optimisticPosts set to prevent duplication
            if (optimisticPosts.has(docSnap.id)) return;
            
            // ... (rest of your rendering logic)
        });
    });
}
