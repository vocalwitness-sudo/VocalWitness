// js/profile.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './firebase-init.js';
import { updateUserProfile, getUserPosts, editPost, deletePost, togglePinPost } from './db.js';
import { getTier, calculateTrustScore } from './utils.js';

const db = getFirestore();

let currentUserId = null;
let currentUserData = null;

let elements = {};

// Cache DOM elements
function cacheDOM() {
    elements = {
        avatar: document.getElementById('profile-avatar'),
        username: document.getElementById('profile-username'),
        email: document.getElementById('profile-email'),
        roleBadge: document.getElementById('profile-role-badge'),
        trustScore: document.getElementById('trust-score'),
        editDisplayName: document.getElementById('edit-displayName'),
        editBio: document.getElementById('edit-bio'),
        nameCooldown: document.getElementById('name-cooldown'),
        myPostsList: document.getElementById('my-posts-list'),
        postCount: document.getElementById('post-count'),
        reputationScore: document.getElementById('reputation-score')
    };
}

// Auth Listener
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        cacheDOM();
        listenToUserProfile(user.uid);
    }
});

function listenToUserProfile(userId) {
    const userRef = doc(db, "users", userId);
    
    onSnapshot(userRef, (snapshot) => {
        if (snapshot.exists()) {
            currentUserData = snapshot.data();
            renderProfileUI();
            renderMyPosts(userId);
        }
    });
}

function renderProfileUI() {
    if (!currentUserData) return;

    const tier = getTier(currentUserData.trustCircle || 50);

    // Avatar
    if (elements.avatar) {
        elements.avatar.innerHTML = currentUserData.photoURL 
            ? `<img src="${currentUserData.photoURL}" class="w-full h-full object-cover">` 
            : '👤';
        elements.avatar.onclick = uploadAvatar;
    }

    // Basic Info
    if (elements.username) elements.username.textContent = `@${currentUserData.username || 'user'}`;
    if (elements.email) elements.email.textContent = currentUserData.email || '';
    if (elements.roleBadge) {
        elements.roleBadge.textContent = (currentUserData.role || 'citizen').toUpperCase();
    }
    if (elements.trustScore) {
        elements.trustScore.textContent = currentUserData.trustCircle || 50;
    }

    // Stats
    if (elements.postCount) elements.postCount.textContent = currentUserData.testimoniesCount || 0;
    if (elements.reputationScore) elements.reputationScore.textContent = calculateTrustScore(currentUserData);

    // Edit Form
    if (elements.editDisplayName) elements.editDisplayName.value = currentUserData.displayName || '';
    if (elements.editBio) elements.editBio.value = currentUserData.bio || '';

    showNameCooldown(currentUserData.lastNameChange);
}

// Name Change Cooldown
function showNameCooldown(lastChange) {
    if (!elements.nameCooldown || !lastChange) return;
    const daysLeft = Math.ceil((lastChange + 60 * 24 * 60 * 60 * 1000 - Date.now()) / 86400000);
    elements.nameCooldown.textContent = daysLeft > 0 ? `(Next change in ${daysLeft} days)` : '';
}

// ==================== SAVE PROFILE ====================
window.saveProfile = async () => {
    if (!currentUserId) return;

    const updates = {
        displayName: elements.editDisplayName?.value.trim(),
        bio: elements.editBio?.value.trim()
    };

    Object.keys(updates).forEach(key => {
        if (!updates[key]) delete updates[key];
    });

    try {
        await updateUserProfile(currentUserId, updates);
        showToast("✅ Profile updated successfully!", "success");   // Better than alert
    } catch (error) {
        showToast("❌ " + error.message, "error");
    }
};

// ==================== AVATAR UPLOAD ====================
window.uploadAvatar = async () => {
    if (!currentUserId) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
            showToast("Image must be smaller than 5MB", "error");
            return;
        }

        try {
            // TODO: Connect with storage.js later
            showToast("🖼️ Avatar upload ready. Integrate with storage.js for full functionality.");
            // Example:
            // const photoURL = await uploadAvatarToStorage(file, currentUserId);
            // await updateUserProfile(currentUserId, { photoURL });
        } catch (err) {
            console.error(err);
            showToast("Failed to upload avatar", "error");
        }
    };

    input.click();
};

// ==================== MY POSTS RENDERING ====================
async function renderMyPosts(userId) {
    const container = elements.myPostsList;
    if (!container) return;

    container.innerHTML = `<p class="text-zinc-400 text-center py-8">Loading your posts...</p>`;

    try {
        const q = getUserPosts(userId);
        const snapshot = await getDocs(q);

        if (snapshot.empty) {
            container.innerHTML = `<p class="text-zinc-400 text-center py-8">You haven't posted any testimonies yet.</p>`;
            return;
        }

        container.innerHTML = '';
        let count = 0;

        snapshot.forEach((docSnap) => {
            count++;
            const post = { id: docSnap.id, ...docSnap.data() };
            const isPinned = post.pinnedBy === userId;

            const postEl = document.createElement('div');
            postEl.className = 'glass rounded-3xl p-6 border border-zinc-700';
            postEl.innerHTML = `
                <div class="flex justify-between items-start mb-3">
                    <div class="flex items-center gap-2 text-xs text-zinc-400">
                        ${isPinned ? '<span class="text-amber-400">📌 Pinned</span>' : ''}
                        <span>${new Date(post.createdAt?.toDate?.() || post.createdAt).toLocaleDateString()}</span>
                    </div>
                    ${post.editedAt ? '<span class="text-[10px] text-zinc-500">Edited</span>' : ''}
                </div>
                
                <div class="text-sm leading-relaxed mb-5">${post.content || ''}</div>
                
                ${post.mediaURL ? `<img src="${post.mediaURL}" class="w-full rounded-2xl mb-4">` : ''}
                
                <div class="flex flex-wrap gap-2 text-sm border-t border-zinc-700 pt-4">
                    <button onclick="editPostHandler('${post.id}')" class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-2xl">✏️ Edit</button>
                    <button onclick="togglePinHandler('${post.id}')" class="px-4 py-2 ${isPinned ? 'bg-amber-600' : 'bg-zinc-800 hover:bg-zinc-700'} rounded-2xl">${isPinned ? '📌 Unpin' : '📍 Pin'}</button>
                    <button onclick="deletePostHandler('${post.id}')" class="px-4 py-2 bg-red-900/50 hover:bg-red-900 text-red-300 rounded-2xl">🗑️ Delete</button>
                    
                    <button onclick="sharePost('${post.id}')" class="px-4 py-2 bg-emerald-900/50 hover:bg-emerald-900 rounded-2xl ml-auto">🔗 Share</button>
                    
                    <button onclick="reactToPost('${post.id}', '👍')" class="px-3 py-2 hover:bg-zinc-700 rounded-2xl">👍</button>
                    <button onclick="reactToPost('${post.id}', '❤️')" class="px-3 py-2 hover:bg-zinc-700 rounded-2xl">❤️</button>
                    <button onclick="reactToPost('${post.id}', '🔥')" class="px-3 py-2 hover:bg-zinc-700 rounded-2xl">🔥</button>
                </div>
            `;
            container.appendChild(postEl);
        });
    } catch (e) {
        console.error(e);
        container.innerHTML = `<p class="text-red-400">Failed to load posts.</p>`;
    }
}

// Global Handlers
window.editPostHandler = async (postId) => {
    const newContent = prompt("Edit your testimony:", "");
    if (newContent === null || !newContent.trim()) return;
    try {
        await editPost(postId, currentUserId, newContent);
        showToast("Post updated successfully");
    } catch (e) { 
        showToast(e.message, "error"); 
    }
};

window.deletePostHandler = async (postId) => {
    if (!confirm("Delete this post permanently?")) return;
    try {
        await deletePost(postId, currentUserId);
        showToast("Post deleted");
    } catch (e) { 
        showToast(e.message, "error"); 
    }
};

window.togglePinHandler = async (postId) => {
    try {
        await togglePinPost(postId, currentUserId);
    } catch (e) { 
        showToast(e.message, "error"); 
    }
};

window.sharePost = (postId) => {
    const url = `${window.location.origin}/?post=${postId}`;
    navigator.clipboard.writeText(url).then(() => {
        showToast("✅ Link copied to clipboard!");
    });
};

window.reactToPost = (postId, emoji) => {
    showToast(`Reacted with ${emoji} (Full reactions system coming soon)`);
};
