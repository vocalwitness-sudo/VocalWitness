import { db, auth } from './firebase-config.js';
import { 
    collection, query, onSnapshot, orderBy, 
    updateDoc, doc, arrayUnion, increment 
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { showToast } from './utils.js';

/**
 * Initializes the groups feed and sets up one single Event Listener
 * for the entire container (Event Delegation).
 */
export function initGroups(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // 1. Setup Delegated Event Listener (Handles all Join clicks efficiently)
    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('.join-btn');
        if (btn) {
            const groupId = btn.dataset.id;
            await joinGroup(groupId);
        }
    });

    // 2. Setup Real-time Feed
    const q = query(collection(db, "groups"), orderBy("createdAt", "desc"));
    
    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-zinc-500 text-center py-10">No groups found. Be the first to start one!</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const div = document.createElement('div');
            div.className = 'glass p-5 rounded-2xl mb-4 flex justify-between items-center';
            
            // Note: We use class="join-btn" and data-id instead of onclick
            div.innerHTML = `
                <div>
                    <h3 class="font-bold text-lg text-emerald-400">${data.name}</h3>
                    <p class="text-sm text-zinc-400">${data.description || 'No description'}</p>
                    <small class="text-xs text-zinc-500">${data.memberCount || 0} members</small>
                </div>
                <button class="join-btn bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm transition" 
                        data-id="${docSnap.id}">
                    Join
                </button>
            `;
            container.appendChild(div);
        });
    });
}

/**
 * Logic for joining a group
 */
export async function joinGroup(groupId) {
    if (!auth.currentUser) return showToast("Please sign in to join", "error");

    try {
        const groupRef = doc(db, 'groups', groupId);
        await updateDoc(groupRef, {
            members: arrayUnion(auth.currentUser.uid),
            memberCount: increment(1)
        });
        showToast("✅ Joined group successfully!", "success");
    } catch (err) {
        console.error(err);
        showToast("Failed to join group", "error");
    }
}
