// js/groups.js - VocalWitness Groups System (with Trending)

import { db, auth } from './firebase-config.js';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
  arrayUnion,
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

  // Create Group modal wiring
  wireCreateGroupModal();

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

function wireCreateGroupModal() {
  const openBtn = document.getElementById('openCreateModalBtn');
  const closeBtn = document.getElementById('closeCreateModalBtn');
  const submitBtn = document.getElementById('submitCreateGroupBtn');
  const modal = document.getElementById('groupModal');

  if (openBtn) {
    openBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showGroupCreationModal();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      closeGroupModal();
    });
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      await createGroupFromForm();
    });
  }

  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeGroupModal();
    });
  }

  document.getElementById('groupName')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      createGroupFromForm();
    }
  });
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

  // ===== TAB FILTERS =====
  if (currentTab === 'my-groups' && currentUid) {
    filtered = filtered.filter(
      (g) => g.members?.includes(currentUid) || g.creatorId === currentUid
    );
  }

  // 🔥 TRENDING
  if (currentTab === 'trending') {
    filtered = filtered
      .map((g) => {
        const members = g.memberCount || 1;
        const created = g.createdAt?.toMillis?.() || (g.createdAt?.seconds ? g.createdAt.seconds * 1000 : 0);
        const updated = g.updatedAt?.toMillis?.() || (g.updatedAt?.seconds ? g.updatedAt.seconds * 1000 : created);

        const ageInDays = (Date.now() - updated) / (1000 * 60 * 60 * 24);
        const recencyBoost = Math.max(0, 30 - ageInDays); // last 30 days get boost

        return {
          ...g,
          _trendingScore: members * 5 + recencyBoost * 2
        };
      })
      .sort((a, b) => b._trendingScore - a._trendingScore)
      .slice(0, 30);
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
    if (emptyState) {
      emptyState.classList.remove('hidden');
      const title = emptyState.querySelector('h3');
      const desc = emptyState.querySelector('p');

      if (currentTab === 'trending') {
        if (title) title.textContent = 'No trending groups yet';
        if (desc) desc.textContent = 'Create a group and invite people to make it trend!';
      } else if (currentTab === 'my-groups') {
        if (title) title.textContent = 'You haven’t joined any groups';
        if (desc) desc.textContent = 'Discover groups or create your own Truth Circle.';
      } else {
        if (title) title.textContent = 'No groups yet';
        if (desc) desc.textContent = 'Be the first to create a Truth Circle in your community.';
      }
    }
    return;
  }

  if (emptyState) emptyState.classList.add('hidden');

  filtered.forEach((group) => {
    const isMember = currentUid && group.members?.includes(currentUid);
    const isCreator = currentUid && group.creatorId === currentUid;

    const card = document.createElement('div');
    card.className = 'glass p-5 rounded-3xl transition hover:border-emerald-500/40 cursor-pointer';
    card.dataset.groupId = group.id;

    const trendingBadge =
      currentTab === 'trending'
        ? `<span class="text-[10px] bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/30">🔥 Trending</span>`
        : '';

    card.innerHTML = `
      <div class="flex justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <h3 class="font-bold text-lg text-emerald-400 truncate">${escapeHtml(group.name)}</h3>
            ${isCreator ? '<span class="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">Creator</span>' : ''}
            ${
              group.visibility === 'witness_circle' || group.creatorTier === 'witness_circle'
                ? '<span class="text-[10px] bg-cyan-500/15 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/30">🔐 High Trust</span>'
                : ''
            }
            ${trendingBadge}
          </div>
          <p class="text-zinc-400 text-sm line-clamp-2 mb-3">
            ${escapeHtml(group.description || 'No description provided')}
          </p>
          <div class="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>👥 ${group.memberCount || 1} members</span>
            <span class="px-2.5 py-1 bg-zinc-800 rounded-full capitalize">
              ${formatVisibility(group.visibility)}
            </span>
          </div>
        </div>
        <div class="shrink-0">
          ${
            isMember
              ? `<button type="button" class="px-5 py-2.5 bg-zinc-800 text-zinc-300 rounded-2xl text-sm font-medium cursor-default">Joined</button>`
              : `<button type="button" class="join-btn bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-2xl text-sm font-medium transition"
                         data-id="${group.id}">Join</button>`
          }
        </div>
      </div>
      <div class="mt-4 pt-3 border-t border-zinc-800 flex flex-wrap gap-2 items-center">
        <button type="button" data-action="tool" data-tool="locker" data-group-id="${group.id}"
                class="text-[11px] px-2.5 py-1 bg-emerald-500/10 text-emerald-400 rounded-full hover:bg-emerald-500/20 transition">
          🗄️ Evidence Locker
        </button>
        <button type="button" data-action="tool" data-tool="attestation" data-group-id="${group.id}"
                class="text-[11px] px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-full hover:bg-amber-500/20 transition">
          📜 Attestation Wall
        </button>
        <button type="button" data-action="tool" data-tool="timeline" data-group-id="${group.id}"
                class="text-[11px] px-2.5 py-1 bg-cyan-500/10 text-cyan-400 rounded-full hover:bg-cyan-500/20 transition">
          ⏱️ Forensic Timeline
        </button>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      window.location.href = `group-detail.html?id=${group.id}`;
    });

    container.appendChild(card);
  });

  // Join buttons
  container.querySelectorAll('.join-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await joinGroup(btn.dataset.id);
    });
  });

  // Tool buttons
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
  } catch (_) {}

  if (visibility === 'witness_circle' && tier !== TIERS.WITNESS_CIRCLE) {
    showToast('Only Witness Circle members can create Witness-only groups', 'error');
    return null;
  }

  const uid = auth.currentUser.uid;
  const payload = {
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
  };

  try {
    const ref = await addDoc(collection(db, 'groups'), payload);
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

async function createGroupFromForm() {
  const nameInput = document.getElementById('groupName');
  const descInput = document.getElementById('groupDesc');
  const visibilityInput = document.getElementById('groupVisibility');
  const submitBtn = document.getElementById('submitCreateGroupBtn');

  if (!nameInput || !nameInput.value.trim()) {
    showToast('Group Name is required', 'error');
    nameInput?.focus();
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';
  }

  try {
    const id = await createNewGroup(
      nameInput.value.trim(),
      descInput ? descInput.value.trim() : '',
      visibilityInput ? visibilityInput.value : 'public'
    );

    if (id) {
      nameInput.value = '';
      if (descInput) descInput.value = '';
      if (visibilityInput) visibilityInput.value = 'public';
      closeGroupModal();
      window.location.href = `group-detail.html?id=${id}`;
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Group';
    }
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

function showGroupCreationModal() {
  const modal = document.getElementById('groupModal');
  if (!modal) {
    showToast('Create modal missing — hard refresh the page', 'error');
    return;
  }
  if (!auth.currentUser) {
    showToast('Please sign in to create a group', 'error');
    return;
  }
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  document.getElementById('groupName')?.focus();
}

function closeGroupModal() {
  const modal = document.getElementById('groupModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

window.showGroupCreationModal = showGroupCreationModal;
window.closeGroupModal = closeGroupModal;
window.createGroup = createGroupFromForm;

window.showUpgradeToWitnessModal = function () {
  const modal = document.getElementById('upgradeToWitnessModal');
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
};

window.closeUpgradeModal = function () {
  const modal = document.getElementById('upgradeToWitnessModal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
};

window.startZKUpgradeFromGroups = function () {
  closeUpgradeModal();
  if (typeof startZKVerification === 'function') {
    startZKVerification();
  } else {
    showToast('ZK Verification module not available', 'error');
  }
};

window.addEventListener('languageChanged', () => {
  renderGroups();
});
