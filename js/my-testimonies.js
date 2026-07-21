// js/my-testimonies.js - With Optimistic UI
import { db, auth } from './firebase-config.js';
import { 
    collection, query, where, onSnapshot, orderBy, 
    deleteDoc, doc, updateDoc 
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { showToast } from './utils.js';

let currentSnapshotUnsubscribe = null;

export function initMyTestimonies(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (currentSnapshotUnsubscribe) currentSnapshotUnsubscribe();

    container.innerHTML = `<div class="text-center py-12 text-zinc-400">Loading your testimonies...</div>`;

    auth.onAuthStateChanged((user) => {
        if (!user) {
            container.innerHTML = `<p class="text-center text-amber-400 py-12">Please sign in to view your testimonies.</p>`;
            return;
        }
        loadUserTestimonies(user.uid, container);
    });
}

function loadUserTestimonies(userId, container) {
    const q = query(
        collection(db, "testimonies"),
        where("author.uid", "==", userId), // Updated to match the denormalized author object structure
        orderBy("createdAt", "desc")
    );

    currentSnapshotUnsubscribe = onSnapshot(q, (snapshot) => {
        renderTestimonies(snapshot, container);
    }, (error) => {
        console.error("Snapshot error:", error);
        container.innerHTML = `<p class="text-red-400 text-center py-8">Error loading testimonies</p>`;
    });
}

function renderTestimonies(snapshot, container) {
    container.innerHTML = '';

    if (snapshot.empty) {
        container.innerHTML = `
            <div class="text-center py-20 glass rounded-3xl p-12">
                <p class="text-6xl mb-4">📭</p>
                <h3 class="text-xl font-semibold mb-2">No testimonies yet</h3>
                <a href="index.html" class="mt-6 inline-block px-8 py-3 bg-emerald-600 text-black rounded-3xl font-medium">Share Your First Testimony</a>
            </div>`;
        return;
    }

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const testimonyId = docSnap.id;
        const textContent = data.text || data.content || ''; // Support both 'text' and legacy 'content' fields
        const dateStr = data.createdAt ? new Date(data.createdAt.toDate()).toLocaleString() : 'N/A';

        const div = document.createElement('div');
        div.className = 'glass rounded-3xl p-6 transition-all';
        div.id = `testimony-${testimonyId}`;
        div.innerHTML = `
            <div class="flex justify-between items-start gap-4">
                <div class="flex-1">
                    <p class="text-zinc-100 leading-relaxed" id="content-${testimonyId}">${textContent}</p>
                    <div class="flex items-center gap-3 mt-4 text-xs">
                        <span class="text-emerald-500">${dateStr}</span>
                        ${data.hasForensic ? `<span class="text-emerald-400">🔬 Forensic Proof</span>` : ''}
                    </div>
                </div>
                <div class="flex flex-col gap-2 text-sm">
                    <button onclick="editTestimony('${testimonyId}')" 
                            class="text-blue-400 hover:text-blue-300 px-4 py-1">Edit</button>
                    <button onclick="deleteTestimony('${testimonyId}')" 
                            class="text-red-400 hover:text-red-300 px-4 py-1">Delete</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
}

// ====================== OPTIMISTIC UPDATES ======================

window.editTestimony = async (testimonyId) => {
    const contentEl = document.getElementById(`content-${testimonyId}`);
    if (!contentEl) return;

    const oldText = contentEl.innerText;
    const newText = prompt("Edit your testimony:", oldText);
    
    if (newText === null || newText.trim() === oldText) return;

    // Optimistic Update
    const originalHTML = contentEl.innerHTML;
    contentEl.innerHTML = newText + ' <span class="text-amber-400 text-xs">(saving...)</span>';

    try {
        await updateDoc(doc(db, 'testimonies', testimonyId), { 
            text: newText,
            updatedAt: new Date()
        });
        showToast("✅ Updated successfully", "success");
    } catch (error) {
        console.error(error);
        contentEl.innerHTML = originalHTML; // Rollback
        showToast("Failed to update. Changes reverted.", "error");
    }
};

window.deleteTestimony = async (testimonyId) => {
    if (!confirm("Delete this testimony permanently?")) return;

    const testimonyEl = document.getElementById(`testimony-${testimonyId}`);
    if (!testimonyEl) return;

    testimonyEl.style.opacity = '0.4';
    testimonyEl.style.pointerEvents = 'none';

    try {
        await deleteDoc(doc(db, 'testimonies', testimonyId));
        testimonyEl.remove(); // Optimistic remove
        showToast("Testimony deleted", "success");
    } catch (error) {
        console.error(error);
        testimonyEl.style.opacity = '1';
        testimonyEl.style.pointerEvents = 'auto';
        showToast("Failed to delete testimony", "error");
    }
};
