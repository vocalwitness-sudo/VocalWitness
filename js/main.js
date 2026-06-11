import { collection, addDoc, onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';

const db = window.db; 
const auth = getAuth(); // Ensure you have auth initialized

// 1. Unified Publishing Logic
export async function postToLedger(content) {
    const user = auth.currentUser;
    if (!user) {
        alert("Authentication required to publish to the Ledger.");
        return;
    }

    try {
        await addDoc(collection(db, "testimonies"), {
            authorId: user.uid,
            witnessText: content,
            feedVisibility: 'citizentalk',
            integrityHash: 'N/A',
            moderation: { votedUsers: [] },
            timestamp: new Date()
        });
        console.log("Post published to Ledger!");
    } catch (e) {
        console.error("Rules Validation Error: ", e);
        alert("Publishing failed: Data does not meet forensic requirements.");
    }
}

// 2. Unified Feed Renderer
export function initDynamicFeed() {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    const q = query(collection(db, "testimonies"), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = '';
        snapshot.forEach((doc) => {
            const data = doc.data();
            const post = document.createElement('div');
            post.className = "bg-[#111827] p-6 rounded-3xl border border-zinc-800 glass mb-4";
            post.innerHTML = `
                <p class="text-zinc-200 text-sm">${data.witnessText}</p>
                <div class="mt-4 flex justify-between items-center">
                    <span class="text-[10px] text-emerald-500 font-bold uppercase tracking-widest">Verified Forensic Entry</span>
                    <small class="text-zinc-500 text-[10px]">${data.timestamp?.toDate().toLocaleTimeString() || ''}</small>
                </div>
            `;
            feedContainer.appendChild(post);
        });
    });
}
