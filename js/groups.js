// js/groups.js
import { db, auth } from './firebase-config.js';
import { 
    collection, query, onSnapshot, orderBy, 
    updateDoc, doc, arrayUnion, increment, 
    addDoc, serverTimestamp 
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { showToast } from './utils.js';
import { getCurrentUserTier, TIERS } from './tier.js';

export function initGroups(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Event Delegation
    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('.join-btn');
        if (btn) {
            const groupId = btn.dataset.id;
            await joinGroup(groupId);
        }
    });

    // Real-time groups feed
    const q = query(collection(db, "groups"), orderBy("createdAt", "desc"));
   
    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
       
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-zinc-500 text-center py-10">No groups yet. Create the first one!</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const div = document.createElement('div');
            div.className = 'glass p-6 rounded-3xl mb-6';
           
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <h3 class="font-bold text-xl text-emerald-400">${data.name}</h3>
                        <p class="text-zinc-400 mt-1">${data.description || 'No description provided'}</p>
                        <div class="flex items-center gap-4 mt-3 text-sm">
                            <span class="text-zinc-500">${data.memberCount || 0} members</span>
                            <span class="px-3 py-1 bg-zinc-800 rounded-full text-xs">${data.visibility || 'public'}</span>
                        </div>
                    </div>
                    <button class="join-btn bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2.5 rounded-2xl text-sm font-medium transition"
                            data-id="${docSnap.id}">
                        Join
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    });
}

export async function joinGroup(groupId) {
    if (!auth.currentUser) return showToast("Please sign in", "error");
    
    try {
        const groupRef = doc(db, 'groups', groupId);
        await updateDoc(groupRef, {
            members: arrayUnion(auth.currentUser.uid),
            memberCount: increment(1)
        });
        showToast("✅ Successfully joined the group!", "success");
    } catch (err) {
        console.error(err);
        showToast("Failed to join group", "error");
    }
}

<!-- Group Creation Modal -->
<div id="groupModal" class="fixed inset-0 bg-black/80 hidden flex items-center justify-center z-[200]">
    <div class="glass rounded-3xl max-w-md w-full mx-4 overflow-hidden">
        <!-- Header -->
        <div class="p-6 border-b border-zinc-700">
            <h2 class="text-2xl font-bold text-white">Create New Group</h2>
            <p class="text-zinc-400 text-sm mt-1">Build your community on VocalWitness</p>
        </div>

        <!-- Form -->
        <div class="p-6 space-y-5">
            <div>
                <label class="block text-sm text-zinc-400 mb-2">Group Name *</label>
                <input id="groupName" type="text" 
                       class="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3.5 focus:outline-none focus:border-emerald-500 text-white"
                       placeholder="e.g. Lagos Truth Circle">
            </div>

            <div>
                <label class="block text-sm text-zinc-400 mb-2">Description</label>
                <textarea id="groupDesc" rows="3"
                          class="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3.5 focus:outline-none focus:border-emerald-500 text-white resize-none"
                          placeholder="What is this group for?"></textarea>
            </div>

            <div>
                <label class="block text-sm text-zinc-400 mb-2">Visibility</label>
                <select id="groupVisibility" 
                        class="w-full bg-zinc-900 border border-zinc-700 rounded-2xl px-5 py-3.5 focus:outline-none focus:border-emerald-500 text-white">
                    <option value="public">Public — Visible in Citizen Square</option>
                    <option value="network">Network Only — My Network members</option>
                    <option value="witness">Witness Circle Only</option>
                </select>
            </div>
        </div>

        <!-- Footer Buttons -->
        <div class="p-6 border-t border-zinc-700 flex gap-3">
            <button onclick="closeGroupModal()" 
                    class="flex-1 py-4 bg-zinc-800 hover:bg-zinc-700 rounded-2xl font-medium transition">
                Cancel
            </button>
            <button onclick="showGroupCreationModal()" 
        class="mt-12 w-full max-w-md mx-auto block bg-emerald-500 text-black font-semibold py-5 rounded-3xl">
    ➕ Create New Group
</button>
        </div>
    </div>
</div>

// Create new group
export async function createNewGroup(name, description, visibility) {
    if (!auth.currentUser) return showToast("Sign in required", "error");

    const tier = await getCurrentUserTier();
    if (tier === TIERS.CITIZEN) {
        return showToast("You must be at least Citizen Circle to create groups", "error");
    }

    try {
        await addDoc(collection(db, "groups"), {
            name,
            description,
            visibility,
            creatorId: auth.currentUser.uid,
            creatorTier: tier,
            memberCount: 1,
            members: [auth.currentUser.uid],
            createdAt: serverTimestamp()
        });

        showToast(`Group "${name}" created successfully!`, "success");
        return true;
    } catch (err) {
        console.error(err);
        showToast("Failed to create group", "error");
        return false;
    }
}
