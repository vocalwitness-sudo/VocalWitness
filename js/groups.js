// js/groups.js - Upgraded Groups System for VocalWitness

import { db, auth } from './firebase-config.js';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
  arrayUnion,
  arrayRemove,
  increment,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

import { showToast } from './utils.js';
import { getCurrentUserTier, TIERS } from './tier.js';
import { startZKVerification } from './verification.js';

let currentTab = 'discover';
let allGroups = [];
let unsubscribe = null;

/**
 * Initialize Groups page
 */
export function initGroups(containerId = 'group-container') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      renderGroups();
    });
  });

  // Search
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.addEventListener('input', () => renderGroups());
  }

  // Real-time listener
  if (unsubscribe) unsubscribe();

  const q = query(collection(db, 'groups'), orderBy('createdAt', 'desc'));

  unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      allGroups = [];
      snapshot.forEach((docSnap) => {
        allGroups.push({
          id: docSnap.id,
          ...docSnap.data()
        });
      });
      renderGroups();
    },
    (error) => {
      console.error('Groups listener error:', error);
      container.innerHTML = `<p class="text-red-400 text-center py-10">Failed to load groups. Check console / indexes.</p>`;
    }
  );
}

/**
 * Render groups based on current tab + search
 */
function renderGroups() {
  const container = document.getElementById('group-container');
  const emptyState = document.getElementById('empty-state');
  if (!container) return;

  const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const currentUid = auth.currentUser?.uid;

  let filtered = [...allGroups];

  // Tab filter logic
  if (currentTab === 'my-groups') {
    if (!currentUid) {
      filtered = [];
    } else {
      filtered = filtered.filter(
        (g) => g.members?.includes(currentUid) || g.creatorId === currentUid
      );
    }
  } else if (currentTab === 'witness_circles') {
    filtered = filtered.filter((g) => g.visibility === 'witness_circle');
  }

  // Search filter
  if (searchTerm) {
    filtered = filtered.filter(
      (g) =>
        (g.name || '').toLowerCase().includes(searchTerm) ||
        (g.description || '').toLowerCase().includes(searchTerm)
    );
  }

  container.innerHTML = '';

  if (filtered.length === 0) {
    if (emptyState) emptyState.classList.remove('hidden');
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  filtered.forEach((group) => {
    const isMember = currentUid && group.members?.includes(currentUid);
    const isCreator = currentUid && group.creatorId === currentUid;

    const card = document.createElement('div');
    card.className =
      'glass p-5 rounded-3xl transition hover:border-emerald-500/50 cursor-pointer shadow-lg';
    card.dataset.groupId = group.id;

    card.innerHTML = `
      <div class="flex justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <h3 class="font-bold text-lg text-emerald-400 truncate">${escapeHtml(group.name)}</h3>
            ${
              isCreator
                ? '<span class="text-[10px] bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-full font-bold">Creator</span>'
                : ''
            }
            ${
              group.visibility === 'witness_circle' || group.creatorTier === 'witness_circle'
                ? '<span class="text-[10px] bg-cyan-500/15 text-cyan-400 px-2.5 py-0.5 rounded-full border border-cyan-500/30 font-bold">🔐 High Trust</span>'
                : ''
            }
          </div>
          <p class="text-zinc-400 text-sm line-clamp-2 mb-3">
            ${escapeHtml(group.description || 'No operational description provided')}
          </p>
          <div class="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>👥 ${group.memberCount || 1} members</span>
            <span class="px-3 py-1 bg-zinc-900 border border-zinc-800 rounded-full capitalize text-zinc-300">
              ${formatVisibility(group.visibility)}
            </span>
          </div>
        </div>
        <div class="shrink-0">
          ${
            isMember
              ? `<button type="button" class="px-5 py-2.5 bg-zinc-900 border border-zinc-800 text-zinc-400 rounded-2xl text-sm font-medium cursor-default">Joined</button>`
              : `<button type="button" class="join-btn bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-2xl text-sm font-bold transition shadow-md shadow-emerald-600/20"
                       data-id="${group.id}">Join</button>`
          }
        </div>
      </div>

      <!-- Institutional Tools Row -->
      <div class="mt-4 pt-3 border-t border-zinc-800/80 flex flex-wrap gap-2 items-center">
        <button type="button" data-action="tool" data-tool="locker" data-group-id="${group.id}"
                class="text-[11px] px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-full hover:bg-emerald-500/20 transition font-medium">
          🗄️ Evidence Locker
        </button>
        <button type="button" data-action="tool" data-tool="attestation" data-group-id="${group.id}"
                class="text-[11px] px-3 py-1 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full hover:bg-amber-500/20 transition font-medium">
          📜 Attestation Wall
        </button>
        <button type="button" data-action="tool" data-tool="timeline" data-group-id="${group.id}"
                class="text-[11px] px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-full hover:bg-cyan-500/20 transition font-medium">
          ⏱️ Forensic Timeline
        </button>
      </div>
    `;

    // Click on card → go to detail page
    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      window.location.href = `group-detail.html?id=${group.id}`;
    });

    container.appendChild(card);
  });

  // Bind join buttons
  container.querySelectorAll('.join-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await joinGroup(btn.dataset.id);
    });
  });

  // Bind tool buttons → navigate directly to the specific tool tab
  container.querySelectorAll('button[data-action="tool"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const toolName = btn.getAttribute('data-tool');
      const groupId = btn.getAttribute('data-group-id');
      window.location.href = `group-detail.html?id=${groupId}&tab=${toolName}`;
    });
  });
}

/**
 * Join a group
 */
export async function joinGroup(groupId) {
  if (!auth.currentUser) {
    return showToast('Please sign in to join groups', 'error');
  }

  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
      members: arrayUnion(auth.currentUser.uid),
      memberCount: increment(1)
    });
    showToast('✅ Successfully joined the group!', 'success');
  } catch (err) {
    console.error(err);
    showToast(err?.message || 'Failed to join group', 'error');
  }
}

/**
 * Create new group
 */
export async function createNewGroup(name, description, visibility) {
  if (!auth.currentUser) {
    showToast('Sign in required to create a group', 'error');
    return null;
  }

  const trimmed = (name || '').trim();
  if (!trimmed) {
    showToast('Group name is required', 'error');
    return null;
  }
  if (trimmed.length > 60) {
    showToast('Group name must be 60 characters or less', 'error');
    return null;
  }

  let tier = TIERS.CITIZEN;
  try {
    tier = (await getCurrentUserTier()) || TIERS.CITIZEN;
  } catch (_) {
    /* allow create even if tier lookup fails */
  }

  if (tier === TIERS.CITIZEN) {
    showToast('You must be at least Citizen Circle to create groups', 'error');
    return null;
  }

  if (visibility === 'witness_circle' && tier !== TIERS.WITNESS_CIRCLE) {
    showToast('Only Witness Circle members can create Witness-only groups', 'error');
    return null;
  }

  const uid = auth.currentUser.uid;

  try {
    const ref = await addDoc(collection(db, 'groups'), {
      name: trimmed,
      description: (description || '').trim().slice(0, 280),
      visibility: visibility || 'public',
      creatorId: uid,
      creatorTier: tier,
      memberCount: 1,
      members: [uid],
      admins: [uid],
      pendingMembers: [],
      hasEvidenceLocker: true,
      hasAttestationWall: true,
      hasForensicTimeline: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    showToast(`🎉 Group "${trimmed}" created!`, 'success');
    return ref.id;
  } catch (err) {
    console.error('createNewGroup error:', err);
    const msg =
      err?.code === 'permission-denied'
        ? 'Permission denied — sign in and check Firestore rules'
        : err?.message || 'Failed to create group';
    showToast(msg, 'error');
    return null;
  }
}

// ====================== HELPERS ======================

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatVisibility(vis) {
  const map = {
    public: 'Public',
    network: 'Network',
    citizen_circle: 'Citizen Circle',
    witness_circle: 'Witness Circle'
  };
  return map[vis] || vis || 'Public';
}

// ====================== GLOBAL MODAL CONTROLS ======================

window.showGroupCreationModal = function () {
  if (!auth.currentUser) {
    showToast('Please sign in to create a group', 'error');
    return;
  }
  const modal = document.getElementById('groupModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.getElementById('groupName')?.focus();
  }
};

window.closeGroupModal = function () {
  const modal = document.getElementById('groupModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

window.createGroup = async function () {
  const nameInput = document.getElementById('groupName');
  const descInput = document.getElementById('groupDesc');
  const visibilityInput = document.getElementById('groupVisibility');

  if (!nameInput || !nameInput.value.trim()) {
    showToast('Group Name is required', 'error');
    nameInput?.focus();
    return;
  }

  const id = await createNewGroup(
    nameInput.value.trim(),
    descInput ? descInput.value.trim() : '',
    visibilityInput ? visibilityInput.value : 'public'
  );

  if (id) {
    nameInput.value = '';
    if (descInput) descInput.value = '';
    if (visibilityInput) visibilityInput.value = 'public';
    window.closeGroupModal();
    // Go straight to the new group
    window.location.href = `group-detail.html?id=${id}`;
  }
};

// Re-render on language change
window.addEventListener('languageChanged', () => {
  renderGroups();
});
