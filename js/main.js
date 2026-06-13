// js/main.js - Simplified Working Version
import { getFirestore, collection, addDoc, getDocs, query, orderBy } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { app } from './firebase-config.js';

const db = getFirestore(app);

let currentFeed = 'citizentalk';

export function init() {
    console.log("✅ VocalWitness loaded successfully");

    setupButtons();
    loadFeed();
}

function setupButtons() {
    // Post Button
    document.getElementById('postButton')?.addEventListener('click', handlePost);

    // Navigation
    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => switchFeed('witness-voice'));
    document.getElementById('btn-citizentalk')?.addEventListener('click', () => switchFeed('citizentalk'));
    document.getElementById('btn-livearena')?.addEventListener('click', () => switchFeed('live-arena'));

    // Profile
    document.getElementById('btn-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.remove('hidden');
    });
    document.getElementById('btn-close-profile')?.addEventListener('click', () => {
        document.getElementById('profilePage').classList.add('hidden');
    });
}

async function handlePost() {
    const input = document.getElementById('mainInput');
    const text = input?.value.trim();

    if (!text) return alert("Please write something...");

    try {
        await addDoc(collection(db, "testimonies"), {
            witnessText: text,
            feedVisibility: currentFeed,
            timestamp: new Date().toISOString(),
            author: "Citizen"
        });

        input.value = "";
        alert("✅ Published to ledger!");
        loadFeed();
    } catch (e) {
        console.error(e);
        alert("Failed to publish. Check console.");
    }
}

function switchFeed(type) {
    currentFeed = type;
    loadFeed();
}

async function loadFeed() {
    const container = document.getElementById('feedContainer');
    if (!container) return;

    container.innerHTML = "<p class='text-center py-8 text-zinc-400'>Loading testimonies...</p>";

    try {
        const q = query(collection(db, "testimonies"), orderBy("timestamp", "desc"));
        const snapshot = await getDocs(q);

        container.innerHTML = "";

        if (snapshot.empty) {
            container.innerHTML = `<div class="text-center py-12 text-zinc-400">No posts yet. Be the first!</div>`;
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const div = document.createElement('div');
            div.className = "post-card glass rounded-3xl p-6 mb-4";
            div.innerHTML = `
                <p class="text-zinc-100">${data.witnessText}</p>
                <small class="text-zinc-500 block mt-3">${new Date(data.timestamp).toLocaleString()}</small>
            `;
            container.appendChild(div);
        });
    } catch (err) {
        console.error(err);
        container.innerHTML = `<p class="text-red-400 text-center">Error loading feed</p>`;
    }
}

// Auto start
document.addEventListener('DOMContentLoaded', init);
