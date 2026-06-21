// js/profile.js
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { auth } from './firebase-init.js';
import { 
  updateUserProfile, getUserData, editPost, deletePost, 
  togglePinPost, getUserPosts 
} from './db.js';

let currentUser = null;
let currentUserData = null;

// DOM Elements (only cache what exists)
let elements = {};

function cacheDOM() {
  elements = {
    avatar: document.getElementById('user-avatar'),
    displayName: document.getElementById('user-display-name'),
    username: document.getElementById('user-username'),
    roleBadge: document.getElementById('user-role-badge'),
    bioEl: document.getElementById('user-bio'),           // Add this in HTML
    nameCooldown: document.getElementById('name-cooldown'), // Add this
    // ... keep your existing ones
    witnessSection: document.getElementById('witness-features-section'),
    witnessLockedNotice: document.getElementById('witness-locked-notice'),
    trustCircleScore: document.getElementById('trust-circle-score'),
    myPostsContainer: document.getElementById('my-posts-list') // Add this
  };
}

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    cacheDOM();
    await loadProfile(user.uid);
  }
});

async function loadProfile(userId) {
  currentUserData = await getUserData(userId);
  if (!currentUserData) return;

  // Populate profile
  if (elements.avatar) elements.avatar.src = currentUserData.photoURL || "https://placehold.co/150";
  if (elements.displayName) elements.displayName.textContent = currentUserData.displayName || "Anonymous";
  if (elements.username) elements.username.textContent = `@${currentUserData.username || 'user'}`;
  if (elements.roleBadge) elements.roleBadge.textContent = (currentUserData.role || 'citizen').toUpperCase();
  if (elements.bioEl) elements.bioEl.textContent = currentUserData.bio || "No biography yet.";

  showNameCooldown(currentUserData.lastNameChange);
  renderMyPosts(userId);
  // Keep your existing witness/citizen logic
  handleWitnessLogic(currentUserData);
}

function showNameCooldown(lastChange) {
  if (!elements.nameCooldown || !lastChange) return;
  const daysLeft = Math.ceil((lastChange + 60*24*60*60*1000 - Date.now()) / (86400000));
  if (daysLeft > 0) {
    elements.nameCooldown.textContent = `(Next name change in ${daysLeft} days)`;
  }
}

// ==================== EDIT PROFILE ====================
window.saveProfile = async () => {
  const newDisplayName = document.getElementById('edit-displayName')?.value.trim();
  const newBio = document.getElementById('edit-bio')?.value.trim();

  try {
    await updateUserProfile(currentUser.uid, {
      displayName: newDisplayName,
      bio: newBio
    });
    alert("✅ Profile updated successfully!");
    loadProfile(currentUser.uid); // refresh
  } catch (err) {
    alert("❌ " + err.message);
  }
};

// ==================== MY POSTS ====================
async function renderMyPosts(userId) {
  if (!elements.myPostsContainer) return;
  elements.myPostsContainer.innerHTML = "<p>Loading your posts...</p>";

  // You can improve this later with onSnapshot for real-time
  // For now, basic query
  const q = getUserPosts(userId);
  // ... render logic with Edit/Delete/Pin buttons
}

// Add these window functions for buttons
window.editPostHandler = async (postId) => {
  const newContent = prompt("Edit post content:");
  if (!newContent) return;
  try {
    await editPost(postId, currentUser.uid, newContent);
    renderMyPosts(currentUser.uid);
  } catch (e) { alert(e.message); }
};

window.deletePostHandler = async (postId) => {
  if (!confirm("Delete this post?")) return;
  try {
    await deletePost(postId, currentUser.uid);
    renderMyPosts(currentUser.uid);
  } catch (e) { alert(e.message); }
};

window.togglePinHandler = async (postId) => {
  try {
    await togglePinPost(postId, currentUser.uid);
    renderMyPosts(currentUser.uid);
  } catch (e) { alert(e.message); }
};
