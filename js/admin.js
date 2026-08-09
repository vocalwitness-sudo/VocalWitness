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
      adminLink.onclick = openAdminDashboard;
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
      row.innerHTML = `
        <td><img src="${user.photoURL || 'https://placehold.co/40'}" width="40"></td>
        <td>${user.displayName || '—'}</td>
        <td>${user.email || '—'}</td>
        <td><strong>${user.role || 'citizen'}</strong></td>
        <td>
          <button onclick="promoteToAdmin('${docSnap.id}')">Make Admin</button>
          <button onclick="demoteUser('${docSnap.id}')">Demote</button>
        </td>
      `;
      tbody.appendChild(row);
    });
  } catch (e) {
    console.error(e);
    tbody.innerHTML = '<tr><td colspan="5">Error loading users</td></tr>';
  }
}

window.promoteToAdmin = async (uid) => {
  if (!confirm("Promote this user to Admin?")) return;
  
  try {
    await updateDoc(doc(db, "users", uid), { role: 'admin' });
    alert("User promoted!");
    loadAllUsers();
  } catch (e) {
    alert("Error: " + e.message);
  }
};

window.demoteUser = async (uid) => {
  if (!confirm("Demote this user?")) return;
  try {
    await updateDoc(doc(db, "users", uid), { role: 'citizen' });
    loadAllUsers();
  } catch (e) {
    alert("Error: " + e.message);
  }
};

window.showTab = (n) => {
  document.querySelectorAll('#admin-dashboard > div').forEach(div => div.classList.add('hidden'));
  const targetTab = document.getElementById(`tab-${n}`);
  if (targetTab) targetTab.classList.remove('hidden');
};
