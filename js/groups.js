// js/groups.js - VocalWitness Groups System (with Trending, Invites & Moderation)

import { db, auth } from './firebase-config.js';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  updateDoc,
  doc,
  getDoc,
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
let currentVisibility = 'all';

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

  // Visibility filters
  document.querySelectorAll('.visibility-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.visibility-filter').forEach((b) => {
        b.classList.remove('active', 'border-emerald-500/40', 'bg-emerald-500/10', 'text-emerald-400');
        b.classList.add('border-zinc-700', 'bg-zinc-800', 'text-zinc-300');
      });
      btn.classList.add('active', 'border-emerald-500/40', 'bg-emerald-500/10', 'text-emerald-400');
      btn.classList.remove('border-zinc-700', 'bg-zinc-800', 'text-zinc-300');
      currentVisibility = btn.dataset.visibility;
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

  // Inspect URL for incoming invite links
  checkIncomingInviteParams();

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

function checkIncomingInviteParams() {
  const params = new URLSearchParams(window.location.search);
  const inviteGroupId = params.get('join') || params.get('code');
  
  if (inviteGroupId) {
    const targetGroup = allGroups.find(g => g.id === inviteGroupId);
    if (typeof window.openGroupInviteModal === 'function') {
      window.openGroupInviteModal({
        id: inviteGroupId,
        name: targetGroup?.name || 'Truth Circle',
        description: targetGroup?.description || 'You were invited to join this collective.',
        isJoining: true
      });
    }
  }
}

function renderGroups() {
  const container = document.getElementById('group-container');
  const emptyState = document.getElementById('empty-state');
  if (!container) return;

  const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
  const currentUid = auth.currentUser?.uid;

  let filtered = [...allGroups];

  if (currentTab === 'my-groups' && currentUid) {
    filtered = filtered.filter(
      (g) => g.members?.includes(currentUid) || g.creatorId === currentUid
    );
  }

  if (currentTab === 'trending') {
    filtered = filtered
      .map((g) => {
        const members = g.memberCount || 1;
        const created = g.createdAt?.toMillis?.() || (g.createdAt?.seconds ? g.createdAt.seconds * 1000 : 0);
        const updated = g.updatedAt?.toMillis?.() || (g.updatedAt?.seconds ? g.updatedAt.seconds * 1000 : created);
        const ageInDays = (Date.now() - updated) / (1000 * 60 * 60 * 24);
        const recencyBoost = Math.max(0, 30 - ageInDays);

        return {
          ...g,
          _trendingScore: members * 5 + recencyBoost * 2
        };
      })
      .sort((a, b) => b._trendingScore - a._trendingScore)
      .slice(0, 30);
  }

  if (currentVisibility !== 'all') {
    filtered = filtered.filter((g) => g.visibility === currentVisibility);
  }

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
    const isPending = currentUid && group.pendingMembers?.includes(currentUid);
    const isCreator = currentUid && group.creatorId === currentUid;
    const requiresApproval = group.visibility === 'citizen_circle' || group.visibility === 'witness_circle';

    const card = document.createElement('div');
    card.className = 'glass p-5 rounded-3xl transition hover:border-emerald-500/40 cursor-pointer';
    card.dataset.groupId = group.id;

    const trendingBadge =
      currentTab === 'trending'
        ? `<span class="text-[10px] bg-orange-500/15 text-orange-400 px-2 py-0.5 rounded-full border border-orange-500/30">🔥 Trending</span>`
        : '';

    let actionButtonHtml = '';
    if (isMember) {
      actionButtonHtml = `<div class="flex items-center gap-2">
        <button type="button" class="share-invite-btn px-3 py-2 bg-emerald-500/15 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/25 rounded-2xl text-xs font-semibold transition" data-id="${group.id}">🔗 Invite</button>
        <button type="button" class="px-4 py-2 bg-zinc-800 text-zinc-300 rounded-2xl text-xs font-medium cursor-default">Joined</button>
      </div>`;
    } else if (isPending) {
      actionButtonHtml = `<button type="button" class="px-4 py-2 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-2xl text-xs font-medium cursor-default">⏳ Pending</button>`;
    } else if (requiresApproval) {
      actionButtonHtml = `<button type="button" class="request-join-btn bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-2xl text-xs font-semibold transition" data-id="${group.id}">Request Join</button>`;
    } else {
      actionButtonHtml = `<button type="button" class="join-btn bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-2xl text-sm font-medium transition" data-id="${group.id}">Join</button>`;
    }

    card.innerHTML = `
      <div class="flex justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1 flex-wrap">
            <h3 class="font-bold text-lg text-emerald-400 truncate">${escapeHtml(group.name)}</h3>
            ${isCreator ? '<span class="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full">Creator</span>' : ''}
            ${group.visibility === 'witness_circle' || group.creatorTier === 'witness_circle' ? '<span class="text-[10px] bg-cyan-500/15 text-cyan-400 px-2 py-0.5 rounded-full border border-cyan-500/30">🔐 High Trust</span>' : ''}
            ${trendingBadge}
          </div>
          <p class="text-zinc-400 text-sm line-clamp-2 mb-3">
            ${escapeHtml(group.description || 'No description provided')}
          </p>
          <div class="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>👥 ${group.memberCount || 1} members</span>
            <span class="px-2.5 py-1 bg-zinc-800 rounded-full capitalize">${formatVisibility(group.visibility)}</span>
          </div>
        </div>
        <div class="shrink-0">${actionButtonHtml}</div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      if (e.target.closest('button')) return;
      window.location.href = `group-detail.html?id=${group.id}`;
    });

    container.appendChild(card);
  });

  container.querySelectorAll('.join-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await joinGroup(btn.dataset.id);
    });
  });

  container.querySelectorAll('.request-join-btn').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await requestToJoinGroup(btn.dataset.id);
    });
  });

  container.querySelectorAll('.share-invite-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const group = allGroups.find(g => g.id === btn.dataset.id);
      if (typeof window.openGroupInviteModal === 'function') {
        window.openGroupInviteModal({
          code: group?.id,
          name: group?.name,
          description: group?.description,
          isJoining: false
        });
      }
    });
  });
}

// ====================== GROUP ACTIONS & MODERATION ======================

export async function joinGroup(groupId) {
  if (!auth.currentUser) return showToast('Please sign in to join groups', 'error');
  try {
    const groupRef = doc(db, 'groups', groupId);
    const snap = await getDoc(groupRef);
    if (snap.exists() && snap.data().bannedMembers?.includes(auth.currentUser.uid)) {
      return showToast('❌ You have been expelled from this group and cannot join.', 'error');
    }
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

export async function requestToJoinGroup(groupId) {
  if (!auth.currentUser) return showToast('Please sign in to request group access', 'error');
  try {
    const groupRef = doc(db, 'groups', groupId);
    const snap = await getDoc(groupRef);
    if (snap.exists() && snap.data().bannedMembers?.includes(auth.currentUser.uid)) {
      return showToast('❌ You have been expelled from this group and cannot join.', 'error');
    }
    await updateDoc(groupRef, {
      pendingMembers: arrayUnion(auth.currentUser.uid)
    });
    showToast('⏳ Request submitted! Waiting for admin approval.', 'success');
  } catch (err) {
    console.error(err);
    showToast(err?.message || 'Failed to submit request', 'error');
  }
}

export async function approveGroupMember(groupId, memberUid) {
  if (!auth.currentUser) return;
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
      pendingMembers: arrayRemove(memberUid),
      members: arrayUnion(memberUid),
      memberCount: increment(1)
    });
    showToast('✅ Member approved!', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to approve member', 'error');
  }
}

export async function rejectGroupMember(groupId, memberUid) {
  if (!auth.currentUser) return;
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, { pendingMembers: arrayRemove(memberUid) });
    showToast('Member request declined', 'info');
  } catch (err) {
    console.error(err);
    showToast('Failed to decline request', 'error');
  }
}

export async function removeGroupMember(groupId, memberUid) {
  if (!auth.currentUser) return;
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
      members: arrayRemove(memberUid),
      admins: arrayRemove(memberUid),
      memberCount: increment(-1)
    });
    showToast('Member removed from group', 'info');
  } catch (err) {
    console.error(err);
    showToast('Failed to remove member', 'error');
  }
}

export async function expelGroupMember(groupId, memberUid) {
  if (!auth.currentUser) return;
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
      members: arrayRemove(memberUid),
      admins: arrayRemove(memberUid),
      pendingMembers: arrayRemove(memberUid),
      bannedMembers: arrayUnion(memberUid),
      memberCount: increment(-1)
    });
    showToast('🚫 Member expelled and banned from group', 'warning');
  } catch (err) {
    console.error(err);
    showToast('Failed to expel member', 'error');
  }
}

export async function unbanGroupMember(groupId, memberUid) {
  if (!auth.currentUser) return;
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, { bannedMembers: arrayRemove(memberUid) });
    showToast('Member unbanned', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to unban member', 'error');
  }
}

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
    bannedMembers: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    const ref = await addDoc(collection(db, 'groups'), payload);
    showToast(`🎉 Group "${trimmed}" created!`, 'success');
    return ref.id;
  } catch (err) {
    console.error('createNewGroup error:', err);
    showToast(err?.message || 'Failed to create group', 'error');
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

function showGroupCreationModal() {
  const modal = document.getElementById('groupModal');
  if (!modal) return;
  if (!auth.currentUser) return showToast('Please sign in to create a group', 'error');
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

/**
 * Voluntarily leave a group (For standard members)
 */
export async function leaveGroup(groupId) {
  if (!auth.currentUser) return showToast('Please sign in first', 'error');

  try {
    const uid = auth.currentUser.uid;
    const groupRef = doc(db, 'groups', groupId);

    await updateDoc(groupRef, {
      members: arrayRemove(uid),
      admins: arrayRemove(uid),
      moderators: arrayRemove(uid),
      memberCount: increment(-1)
    });

    await logGroupAction(groupId, 'MEMBER_LEFT', { uid });
    showToast('You have left the group.', 'info');
  } catch (err) {
    console.error('leaveGroup error:', err);
    showToast('Failed to leave group', 'error');
  }
}

/**
 * Suspend a member from posting/depositing evidence (Temporary Mute/Restriction)
 */
export async function suspendGroupMember(groupId, memberUid) {
  if (!auth.currentUser) return;
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
      suspendedMembers: arrayUnion(memberUid)
    });
    await logGroupAction(groupId, 'MEMBER_SUSPENDED', { targetUid: memberUid, adminUid: auth.currentUser.uid });
    showToast('Member suspended from group actions', 'warning');
  } catch (err) {
    console.error('suspendGroupMember error:', err);
    showToast('Failed to suspend member', 'error');
  }
}

/**
 * Unsuspend a member
 */
export async function unsuspendGroupMember(groupId, memberUid) {
  if (!auth.currentUser) return;
  try {
    const groupRef = doc(db, 'groups', groupId);
    await updateDoc(groupRef, {
      suspendedMembers: arrayRemove(memberUid)
    });
    await logGroupAction(groupId, 'MEMBER_UNSUSPENDED', { targetUid: memberUid, adminUid: auth.currentUser.uid });
    showToast('Member suspension lifted', 'success');
  } catch (err) {
    console.error('unsuspendGroupMember error:', err);
    showToast('Failed to lift suspension', 'error');
  }
}

/**
 * Log administrative actions to group audit trail
 */
export async function logGroupAction(groupId, actionType, details = {}) {
  try {
    await addDoc(collection(db, 'groups', groupId, 'audit_logs'), {
      action: actionType,
      performedBy: auth.currentUser?.uid || 'system',
      details,
      timestamp: serverTimestamp()
    });
  } catch (err) {
    console.warn('Audit log write skipped:', err);
  }
}
