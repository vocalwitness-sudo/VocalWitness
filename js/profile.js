// js/profile.js
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, updateDoc, getDocs } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";
import { auth } from './firebase-init.js';
import { updateUserProfile, getUserPosts, editPost, deletePost, togglePinPost } from './db.js';

const db = getFirestore();

let currentUserId = null;
let currentUserData = null;

// Cache DOM elements
const avatarEl = document.getElementById('user-avatar');
const displayNameEl = document.getElementById('user-display-name');
const usernameEl = document.getElementById('user-username');
const roleBadgeEl = document.getElementById('user-role-badge');
const witnessSection = document.getElementById('witness-features-section');
const witnessLockedNotice = document.getElementById('witness-locked-notice');
const trustCircleScoreEl = document.getElementById('trust-circle-score');

// New elements from the enhanced HTML
const editDisplayNameInput = document.getElementById('edit-displayName');
const editBioInput = document.getElementById('edit-bio');
const nameCooldownEl = document.getElementById('name-cooldown');
const myPostsContainer = document.getElementById('my-posts-list');

// Keep existing verification elements...
const panelVerification = document.getElementById('verification-panel');
const chkPhone = document.getElementById('chk-phone');
const chkZk = document.getElementById('chk-zk');
const chkTestimonies = document.getElementById('chk-testimonies');
const phoneText = document.getElementById('phone-status-text');
const zkText = document.getElementById('zk-status-text');
const testimoniesText = document.getElementById('testimonies-status-text');
const btnUpgrade = document.getElementById('btn-upgrade-witness');
const btnVerifyZK = document.getElementById("btn-verify-zk");
const btnVerifyPhone = document.getElementById('btn-verify-phone');

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserId = user.uid;
    listenToUserProfile(user.uid);
  }
});

function listenToUserProfile(userId) {
  const userRef = doc(db, "users", userId);

  onSnapshot(userRef, (snapshot) => {
    if (snapshot.exists()) {
      currentUserData = snapshot.data();
      
      // Populate basic info
      if (avatarEl) avatarEl.src = currentUserData.photoURL || "https://placehold.co/150";
      if (displayNameEl) displayNameEl.textContent = currentUserData.displayName || "Anonymous User";
      if (usernameEl) usernameEl.textContent = `@${currentUserData.username || 'user'}`;
      if (roleBadgeEl) roleBadgeEl.textContent = (currentUserData.role || 'citizen').toUpperCase();

      // New fields
      if (editDisplayNameInput) editDisplayNameInput.value = currentUserData.displayName || '';
      if (editBioInput) editBioInput.value = currentUserData.bio || '';

      showNameCooldown(currentUserData.lastNameChange);
      
      // Existing witness logic
      handleWitnessLogic(currentUserData);
      
      // Load user's posts
      renderMyPosts(userId);
    }
  });
}

function showNameCooldown(lastChange) {
  if (!nameCooldownEl || !lastChange) return;
  const daysLeft = Math.ceil((lastChange + 60 * 24 * 60 * 60 * 1000 - Date.now()) / (86400000));
  if (daysLeft > 0) {
    nameCooldownEl.textContent = `(Next change in ${daysLeft} days)`;
  } else {
    nameCooldownEl.textContent = '';
  }
}

function handleWitnessLogic(userData) {
  // Keep your existing witness/citizen logic here (unchanged)
  if (userData.role === "witness" || userData.role === "trusted_witness") {
    if (witnessSection) witnessSection.style.display = "block";
    if (witnessLockedNotice) witnessLockedNotice.style.display = "none";
    if (panelVerification) panelVerification.style.display = "none"; 
    if (trustCircleScoreEl) trustCircleScoreEl.textContent = userData.trustCircle || 0;
  } else {
    if (witnessSection) witnessSection.style.display = "none";
    if (witnessLockedNotice) witnessLockedNotice.style.display = "block";
    if (panelVerification) panelVerification.style.display = "block"; 
    evaluateChecklist(userData);
  }
}

// ==================== UPDATED saveProfile() ====================
window.saveProfile = async () => {
  if (!currentUserId) return;

  const updates = {
    displayName: editDisplayNameInput ? editDisplayNameInput.value.trim() : null,
    bio: editBioInput ? editBioInput.value.trim() : null
  };

  // Remove null values
  Object.keys(updates).forEach(key => {
    if (updates[key] === null || updates[key] === undefined) delete updates[key];
  });

  try {
    await updateUserProfile(currentUserId, updates);
    alert("✅ Profile updated successfully!");
  } catch (error) {
    alert("❌ " + error.message);
  }
};

// ==================== AVATAR UPLOAD LOGIC ====================
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
      // You can integrate with your existing storage.js or add here
      alert("🖼️ Avatar upload flow ready. Connect to storage.js for full implementation.");
      
      // Example placeholder (replace with real upload):
      // const photoURL = await uploadToFirebaseStorage(file, currentUserId);
      // await updateDoc(doc(db, "users", currentUserId), { photoURL });
      
    } catch (error) {
      console.error(error);
      alert("Failed to upload avatar");
    }
  };
  
  input.click();
};

// ==================== IMPROVED MY POSTS RENDERING ====================
async function renderMyPosts(userId) {
  if (!myPostsContainer) return;
  
  myPostsContainer.innerHTML = `<p class="text-zinc-400 text-center py-8">Loading your posts...</p>`;

  try {
    const q = getUserPosts(userId);
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      myPostsContainer.innerHTML = `<p class="text-zinc-400 text-center py-8">You haven't posted any testimonies yet.</p>`;
      return;
    }

    myPostsContainer.innerHTML = '';
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
      myPostsContainer.appendChild(postEl);
    });
  } catch (e) {
    console.error(e);
    myPostsContainer.innerHTML = `<p class="text-red-400">Failed to load posts.</p>`;
  }
}

// Global handlers
window.editPostHandler = async (postId) => {
  const newContent = prompt("Edit your testimony:", "");
  if (newContent === null) return;
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
  alert(`Reacted with ${emoji} (Full reactions system coming soon)`);
};
