import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';

// 1. Firebase Config (Replace with your actual keys)
const firebaseConfig = {
    apiKey: "AIzaSyATxYekXgjdLP2SfR42FG8rEdajq_pIEb0",
    authDomain: "vocalwitness-3affa.firebaseapp.com",
    projectId: "vocalwitness-3affa",
    storageBucket: "vocalwitness-3affa.firebasestorage.app",
    messagingSenderId: "108466981866",
    appId: "1:108466981866:web:b53360ad44012a576c8093"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 2. Core Logic
async function postToLedger(content) {
    const user = auth.currentUser;
    if (!user) return alert("Authentication required.");

    try {
        await addDoc(collection(db, "testimonies"), {
            authorId: user.uid,
            witnessText: content,
            feedVisibility: 'citizentalk',
            integrityHash: 'N/A',
            moderation: { votedUsers: [] },
            timestamp: new Date()
        });
        console.log("Post published!");
    } catch (e) {
        console.error("Rules Error: ", e);
        alert("Publishing failed: Check console for security requirements.");
    }
}

function initDynamicFeed() {
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
                <div class="mt-4 text-[10px] text-emerald-500 font-bold uppercase tracking-widest">
                    Verified Forensic Entry
                </div>
            `;
            feedContainer.appendChild(post);
        });
    });
}

// 3. UI Initialization & Listeners
export function init() {
    // Buttons
    const postButton = document.getElementById('postButton');
    const mainInput = document.getElementById('mainInput');
    const btnProfile = document.getElementById('btn-profile');
    const btnCloseProfile = document.getElementById('btn-close-profile');

    if (postButton) {
        postButton.addEventListener('click', async () => {
            if (mainInput.value.trim()) {
                await postToLedger(mainInput.value.trim());
                mainInput.value = "";
            }
        });
    }

    if (btnProfile) {
        btnProfile.addEventListener('click', () => {
            document.getElementById('profilePage').classList.remove('hidden');
        });
    }

    if (btnCloseProfile) {
        btnCloseProfile.addEventListener('click', () => {
            document.getElementById('profilePage').classList.add('hidden');
        });
    }

    initDynamicFeed();
}
