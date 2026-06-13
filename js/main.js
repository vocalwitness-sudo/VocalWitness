// js/main.js - VocalWitness Core
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { 
    getFirestore, collection, addDoc, getDocs, 
    query, orderBy, onSnapshot 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

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

// Current feed type
let currentFeed = 'citizentalk';

// Initialize the app
export function init() {
    console.log("✅ VocalWitness initialized successfully");

    setupEventListeners();
    loadFeed();
}

// Setup all button listeners
function setupEventListeners() {
    // Post Button
    const postBtn = document.getElementById('postButton');
    if (postBtn) {
        postBtn.addEventListener('click', handlePost);
    }

    // Navigation buttons
    document.getElementById('btn-witnessvoice')?.addEventListener('click', () => switchFeed('witness-voice'));
    document.getElementById('btn-citizentalk')?.addEventListener('click', () => switchFeed('citizentalk'));
    document.getElementById('btn-livearena')?.addEventListener('click', () => switchFeed('live-arena'));

    // Profile
    document.getElementById('btn-profile')?.addEventListener('click', showProfile);
    document.getElementById('btn-close-profile')?.addEventListener('click', hideProfile);
}

// Handle new post
async function handlePost() {
    const input = document.getElementById('mainInput');
    const text = input.value.trim();

    if (!text) {
        alert("Please write something before publishing.");
        return;
    }

    try {
        await addDoc(collection(db, "testimonies"), {
            witnessText: text,
            feedVisibility: currentFeed,
            timestamp: new Date().toISOString(),
            author: "Anonymous Citizen", // You can replace with auth later
        });

        input.value = "";
        alert("✅ Published to the decentralized ledger!");
        loadFeed(); // Refresh feed
    } catch (error) {
        console.error("Post failed:", error);
        alert("Failed to publish. Check your internet connection.");
    }
}

// Switch between feeds
function switchFeed(feedType) {
    currentFeed = feedType;
    
    // Visual feedback
    document.querySelectorAll('nav button').forEach(btn => {
        btn.classList.remove('bg-emerald-500', 'text-black');
        btn.classList.add('bg-zinc-800', 'text-zinc-400');
    });

    const activeBtn = document.getElementById(
        feedType === 'witness-voice' ? 'btn-witnessvoice' :
        feedType === 'citizentalk' ? 'btn-citizentalk' : 'btn-livearena'
    );
    
    if (activeBtn) {
        activeBtn.classList.add('bg-emerald-500', 'text-black');
        activeBtn.classList.remove('bg-zinc-800', 'text-zinc-400');
    }

    loadFeed();
}

// Load and display feed
async function loadFeed() {
    const feedContainer = document.getElementById('feedContainer');
    if (!feedContainer) return;

    feedContainer.innerHTML = '<p class="text-zinc-400 text-center py-8">Loading ledger...</p>';

    try {
        const q = query(
            collection(db, "testimonies"),
            orderBy("timestamp", "desc")
        );

        const snapshot = await getDocs(q);
        feedContainer.innerHTML = '';

        if (snapshot.empty) {
            feedContainer.innerHTML = `
                <div class="text-center py-12 text-zinc-400">
                    <p class="text-6xl mb-4">🌍</p>
                    <p>No testimonies yet. Be the first to speak.</p>
                </div>`;
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const postEl = document.createElement('div');
            postEl.className = "post-card glass rounded-3xl p-6 mb-4";
            postEl.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-3">
                        <div class="w-9 h-9 bg-emerald-900 rounded-2xl flex items-center justify-center text-xl">👤</div>
                        <div>
                            <p class="font-semibold">${data.author || "Citizen"}</p>
                            <p class="text-xs text-zinc-500">${new Date(data.timestamp).toLocaleString()}</p>
                        </div>
                    </div>
                    <span class="text-xs bg-emerald-900/50 px-3 py-1 rounded-full">${data.feedVisibility || 'ledger'}</span>
                </div>
                <p class="text-zinc-100 leading-relaxed">${data.witnessText}</p>
            `;
            feedContainer.appendChild(postEl);
        });
    } catch (error) {
        console.error("Feed load error:", error);
        feedContainer.innerHTML = `<p class="text-red-400 text-center py-8">Error loading feed. Please refresh.</p>`;
    }
}

function showProfile() {
    document.getElementById('profilePage').classList.remove('hidden');
}

function hideProfile() {
    document.getElementById('profilePage').classList.add('hidden');
}

// Auto start
document.addEventListener('DOMContentLoaded', init);
