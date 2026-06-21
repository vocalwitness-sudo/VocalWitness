// js/profile.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, getDocs } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth } from './firebase-init.js';
import { updateUserProfile, getUserPosts, editPost, deletePost, togglePinPost } from './db.js';

const db = getFirestore();

let currentUserId = null;
let currentUserData = null;

// DOM Elements - Will be cached after DOM is ready
let elements = {};

// Cache DOM elements safely
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
    // Existing elements (add more if needed)
    witnessSection: document.getElementById('witness-features-section'),
    witnessLockedNotice: document.getElementById('witness-locked-notice'),
  };
}

// Listen to auth state
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

  // Basic profile info
  if (elements.avatar) {
    elements.avatar.innerHTML = currentUserData.photoURL 
      ? `<img src="${currentUserData.photoURL}" class="w-full h-full object-cover">` 
      : '👤';
    elements.avatar.onclick = uploadAvatar;
  }

  if (elements.username) elements.username.textContent = `@${currentUserData.username || 'user'}`;
  if (elements.email) elements.email.textContent = currentUserData.email || currentUserData.displayName || '';
  if (elements.roleBadge) {
    elements.roleBadge.textContent = (currentUserData.role || 'citizen').toUpperCase();
  }
  if (elements.trustScore) elements.trustScore.textContent = currentUserData.trustCircle || 50;

  // Edit form
  if (elements.editDisplayName) elements.editDisplayName.value = currentUserData.displayName || '';
  if (elements.editBio) elements.editBio.value = currentUserData.bio || '';

  showNameCooldown(currentUserData.lastNameChange);
  handleWitnessLogic(currentUserData);
}

function showNameCooldown(lastChange) {
  if (!elements.nameCooldown || !lastChange) return;
  const daysLeft = Math.ceil((lastChange + 60 * 24 * 60 * 60 * 1000 - Date.now()) / 86400000);
  elements.nameCooldown.textContent = daysLeft > 0 ? `(Next change in ${daysLeft} days)` : '';
}

function handleWitnessLogic(userData) {
  // TODO: Expand with your full witness logic
  if (userData.role === "witness" || userData.role === "trusted_witness") {
    if (elements.witnessSection) elements.witnessSection.style.display = "block";
    if (elements.witnessLockedNotice) elements.witnessLockedNotice.style.display = "none";
  } else {
    if (elements.witnessSection) elements.witnessSection.style.display = "none";
    if (elements.witnessLockedNotice) elements.witnessLockedNotice.style.display = "block";
  }
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
    alert("✅ Profile updated successfully!");
  } catch (error) {
    alert("❌ " + error.message);
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
      alert("Image must be smaller than 5MB");
      return;
    }

    try {
      alert("🖼️ Avatar upload ready. Connect with storage.js for full support.");
      // Future: Integrate with your storage.js
    } catch (err) {
      console.error(err);
      alert("Failed to upload avatar");
    }
  };

  input.click();
};

// ==================== MY POSTS ====================
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
  } catch (e) { alert(e.message); }
};

window.deletePostHandler = async (postId) => {
  if (!confirm("Delete this post permanently?")) return;
  try {
    await deletePost(postId, currentUserId);
  } catch (e) { alert(e.message); }
};

window.togglePinHandler = async (postId) => {
  try {
    await togglePinPost(postId, currentUserId);
  } catch (e) { alert(e.message); }
};

window.sharePost = (postId) => {
  const url = `${window.location.origin}/?post=${postId}`;
  navigator.clipboard.writeText(url).then(() => {
    alert("✅ Link copied to clipboard!");
  });
};

window.reactToPost = (postId, emoji) => {
  alert(`Reacted with ${emoji} (Full reaction system coming soon)`);
};
