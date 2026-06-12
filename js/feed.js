import { db, auth } from "./firebase-config.js";
import { collection, query, orderBy, onSnapshot, where, doc, updateDoc, increment, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from "./utils.js";
import { state } from './storage.js';

export async function postNow() {
    const feedType = currentFeed; 
    
    // Using state.isWitnessVerified instead of state.isVerified for consistency
    if (feedType === 'vocal-truth' && !state.isWitnessVerified) {
        return showToast("⚠️ Forensic Access requires Tier 1 Verification.");
    }
}

const feedContainer = document.getElementById('feed');
let activeFeedListener = null;
const optimisticPosts = new Set();

export function addPostToFeed(postData, isOptimistic = false) {
    const post = document.createElement('div');
    post.id = postData.id;
    post.className = `witness-card glass rounded-3xl p-5 border border-zinc-900 bg-[#090f1d]/40 ${isOptimistic ? 'opacity-60' : ''}`;
    post.innerHTML = `<p>${postData.witnessText}</p><small>${isOptimistic ? 'Syncing...' : 'Verified'}</small>`;
    
    if (feedContainer) feedContainer.prepend(post);
    if (isOptimistic) optimisticPosts.add(postData.id);
}

export async function submitPeerVote(postId, action = 'verify') {
    const user = auth.currentUser;
    if (!user) return showToast("Must be logged in.");

    const postRef = doc(db, "testimonies", postId);
    const voteRef = doc(db, "testimonies", postId, "votes", user.uid);

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

export function listenToLedgerFeed(currentFeed) {
    if (activeFeedListener) activeFeedListener();

    const q = query(collection(db, "testimonies"), where("feedType", "==", currentFeed), orderBy("timestamp", "desc"));

    activeFeedListener = onSnapshot(q, (snapshot) => {
        if (feedContainer) feedContainer.innerHTML = '';
        snapshot.forEach((docSnap) => {
            if (optimisticPosts.has(docSnap.id)) return;
            // ... (rest of your rendering logic)
        });
    });
}
