// js/admin.js
import { db, auth } from './firebase-config.js';
import { collection, getDocs, doc, updateDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { initAdminVerification } from './adminVerification.js';

export async function initAdminDashboard() {
  const user = auth.currentUser;
  if (!user) return;

  // Check if admin via custom claim or Firestore role
  const idToken = await user.getIdTokenResult();
  const isAdmin = idToken.claims.admin === true;

  if (isAdmin) {
    const adminLink = document.getElementById('admin-link');
    if (adminLink) {
      adminLink.classList.remove('hidden');
      // Clean way instead of .onclick
      adminLink.addEventListener('click', openAdminDashboard);
    }
  }
}

async function openAdminDashboard() {
  const dashboard = document.getElementById('admin-dashboard');
  if (dashboard) {
    dashboard.classList.remove('hidden');
    await loadAllUsers();
    
    // Initialize verification container if present
    if (document.getElementById('admin-verification-container')) {
      initAdminVerification('admin-verification-container');
    }
  }
}

function closeAdminDashboard() {
  const dashboard = document.getElementById('admin-dashboard');
  if (dashboard) {
    dashboard.classList.add('hidden');
  }
}

async function loadAllUsers() {
  const tbody = document.getElementById('admin-user-list');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="5">Loading users...</td></tr>';

  try {
    const querySnapshot = await getDocs(collection(db, "users"));
    tbody.innerHTML = '';

    querySnapshot.forEach((docSnap) => {
      const user = docSnap.data();
      const row = document.createElement('tr');
      
      // Create cells cleanly (no inline onclick)
      row.innerHTML = `
        <td><img src="${user.photoURL || 'https://placehold.co/40'}" width="40"></td>
        <td>${user.displayName || '—'}</td>
        <td>${user.email || '—'}</td>
        <td><strong>${user.role || 'citizen'}</strong></td>
        <td class="flex gap-2">
          <button class="promote-btn bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-3 py-1.5 rounded">Make Admin</button>
          <button class="demote-btn bg-rose-600 hover:bg-rose-500 text-white text-xs px-3 py-1.5 rounded">Demote</button>
        </td>
      `;

      // Attach listeners properly
      const promoteBtn = row.querySelector('.promote-btn');
      const demoteBtn = row.querySelector('.demote-btn');

      promoteBtn?.addEventListener('click', () => promoteToAdmin(docSnap.id));
      demoteBtn?.addEventListener('click', () => demoteUser(docSnap.id));

      tbody.appendChild(row);
    });
  } catch (e) {
    console.error(e);
    tbody.innerHTML = '<tr><td colspan="5">Error loading users</td></tr>';
  }
}

async function promoteToAdmin(uid) {
  if (!confirm("Promote this user to Admin?")) return;
  
  try {
    await updateDoc(doc(db, "users", uid), { role: 'admin' });
    alert("User promoted!");
    loadAllUsers();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

async function demoteUser(uid) {
  if (!confirm("Demote this user?")) return;
  try {
    await updateDoc(doc(db, "users", uid), { role: 'citizen' });
    loadAllUsers();
  } catch (e) {
    alert("Error: " + e.message);
  }
}

function showTab(n) {
  document.querySelectorAll('#admin-dashboard > div').forEach(div => div.classList.add('hidden'));
  const targetTab = document.getElementById(`tab-${n}`);
  if (targetTab) targetTab.classList.remove('hidden');
}

// Make only the needed functions available if something still expects them on window
window.showTab = showTab;
