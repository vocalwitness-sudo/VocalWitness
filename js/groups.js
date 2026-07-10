import { db, auth } from './firebase-config.js';
import { 
    collection, query, onSnapshot, orderBy, 
    updateDoc, doc, arrayUnion, increment 
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { showToast } from './utils.js';

// Initialize the groups feed in a specific container
export function initGroups(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const q = query(collection(db, "groups"), orderBy("createdAt", "desc"));

    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-zinc-500 text-center">No groups found. Be the first to start one!</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const div = document.createElement('div');
            div.className = 'glass p-5 rounded-2xl mb-4 flex justify-between items-center';
            // Inside initGroups in group.js
container.addEventListener('click', (e) => {
    if (e.target.matches('.join-btn')) {
        const groupId = e.target.dataset.id;
        joinGroup(groupId); // Call your logic function directly
    }
});

            div.innerHTML = `
                <div>
                    <h3 class="font-bold text-lg text-emerald-400">${data.name}</h3>
                    <p class="text-sm text-zinc-400">${data.description || 'No description'}</p>
                    <small class="text-xs text-zinc-500">${data.memberCount || 0} members</small>
                </div>
                <button class="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-xl text-sm transition" 
                        onclick="joinGroup('${docSnap.id}')">
                    Join
                </button>
            `;
            container.appendChild(div);
        });
    });
}

// Logic for joining a group
window.joinGroup = async (groupId) => {
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
};
