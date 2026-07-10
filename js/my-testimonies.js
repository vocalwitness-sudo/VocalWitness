import { db, auth } from './firebase-config.js';
import { 
    collection, query, where, onSnapshot, orderBy, 
    deleteDoc, doc 
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { showToast } from './utils.js';
import { updateDoc } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

window.editTestimony = async (testimonyId) => {
    const newText = prompt("Edit your testimony:", document.getElementById(`text-${testimonyId}`).innerText);
    if (newText !== null && newText.trim() !== "") {
        try {
            await updateDoc(doc(db, 'testimonies', testimonyId), { content: newText });
            showToast("Updated successfully!", "success");
        } catch (error) {
            showToast("Failed to update.", "error");
        }
    }
};

export function initMyTestimonies(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    auth.onAuthStateChanged((user) => {
        if (user) {
            loadUserTestimonies(user.uid, container);
        } else {
            container.innerHTML = '<p class="text-zinc-500 text-center">Please sign in to view your testimonies.</p>';
        }
    });
}

function loadUserTestimonies(userId, container) {
    const testimoniesRef = collection(db, 'testimonies');
    
    // Note: Ensure your Firestore index matches this query (userId + timestamp)
    const q = query(
        testimoniesRef, 
        where("authorId", "==", userId), 
        orderBy("timestamp", "desc")
    );

    onSnapshot(q, (snapshot) => {
        container.innerHTML = '';
        
        if (snapshot.empty) {
            container.innerHTML = '<p class="text-zinc-500 text-center">No testimonies published yet.</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const div = document.createElement('div');
            div.className = 'glass p-4 rounded-2xl flex justify-between items-start mb-3';
            // Inside your snapshot loop
div.innerHTML = `
    <div>
        <p class="text-zinc-300" id="text-${docSnap.id}">${data.content || '...'}</p>
        <small class="text-emerald-500">${dateStr}</small>
    </div>
    <div class="flex gap-2">
        <button class="text-blue-400 hover:text-blue-300 text-xs" onclick="editTestimony('${docSnap.id}')">Edit</button>
        <button class="text-red-400 hover:text-red-300 text-xs" onclick="deleteTestimony('${docSnap.id}')">Delete</button>
    </div>
`;
            
            // Format timestamp (Assuming ISO string as per your publishTestimony)
            const dateStr = data.timestamp ? new Date(data.timestamp).toLocaleDateString() : 'N/A';

            div.innerHTML = `
                <div>
                    <p class="text-zinc-300">${data.content || '...'}</p>
                    <small class="text-emerald-500">${dateStr}</small>
                </div>
                <button class="text-red-400 hover:text-red-300 text-xs ml-4" onclick="deleteTestimony('${docSnap.id}')">
                    Delete
                </button>
            `;
            container.appendChild(div);
        });
    });
}

window.deleteTestimony = async (testimonyId) => {
    if (confirm("Are you sure you want to delete this testimony?")) {
        try {
            await deleteDoc(doc(db, 'testimonies', testimonyId));
            showToast("Testimony deleted successfully", "success");
        } catch (error) {
            console.error("Error deleting:", error);
            showToast("Failed to delete testimony", "error");
        }
    }
};
