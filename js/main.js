import { collection, addDoc, onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

// Access global db from HTML
const db = window.db;

// Save to Firestore
export async function postToLedger(content) {
    try {
        await addDoc(collection(db, "witness_posts"), {
            text: content,
            timestamp: new Date()
        });
        console.log("Post published!");
    } catch (e) {
        console.error("Error writing to ledger: ", e);
    }
}

// Render dynamic feed
export function initDynamicFeed() {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    const q = query(collection(db, "testimonies"), orderBy("timestamp", "desc"));
    
    onSnapshot(q, (snapshot) => {
        feedContainer.innerHTML = '';
        snapshot.forEach((doc) => {
            const data = doc.data();
            const post = document.createElement('div');
            post.className = "bg-zinc-900 p-4 rounded-xl border border-zinc-800 mb-4";
            post.innerHTML = `
                <p class="text-white text-sm">${data.text}</p>
                <small class="text-emerald-500 text-[10px]">Posted: ${data.timestamp.toDate().toLocaleTimeString()}</small>
            `;
            feedContainer.appendChild(post);
        });
    });
}

// Inside main.js
postButton.addEventListener('click', async () => {
    const text = mainInput.value.trim();
    const user = auth.currentUser; // Make sure 'auth' is imported
    
    if (!text || !user) return;

    try {
        await addDoc(collection(db, "testimonies"), { // Changed collection name to 'testimonies' to match your rules
            authorId: user.uid,
            witnessText: text,
            feedVisibility: 'citizentalk', // Default for now
            integrityHash: 'N/A',
            moderation: {
                votedUsers: []
            },
            timestamp: new Date()
        });
        mainInput.value = "";
        alert("Post Published!");
    } catch (e) {
        console.error("Rules Validation Error: ", e);
        alert("Publishing failed: Check console for rules violation.");
    }
});
