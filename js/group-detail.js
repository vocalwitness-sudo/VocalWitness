// js/group-detail.js
// Complete Group Detail page with Invite Code, Expiration & Approval

import { db, auth } from './firebase-config.js';
import {
  doc,
  onSnapshot,
  updateDoc,
  arrayUnion,
  arrayRemove,
  increment,
  collection,
  query,
  where,
  orderBy,
  addDoc,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

import { showToast } from './utils.js';

let currentGroupId = null;
let currentGroupData = null;
let unsubscribeGroup = null;
let unsubscribeFeed = null;

/**
 * Main entry point
 */
export function initGroupDetail() {
  const params = new URLSearchParams(window.location.search);
  currentGroupId = params.get('id');

  if (!currentGroupId) {
    showToast('Group not found', 'error');
    setTimeout(() => (window.location.href = 'groups.html'), 1500);
    return;
  }

  loadGroup();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.remove('active', 'text-emerald-400');
        b.classList.add('text-zinc-400');
      });
      btn.classList.add('active', 'text-emerald-400');
      btn.classList.remove('text-zinc-400');

      document.querySelectorAll('[id^="tab-"]').forEach((t) => t.classList.add('hidden'));
      const tab = btn.dataset.tab;
      document.getElementById(`tab-${tab}`)?.classList.remove('hidden');
    });
  });

  // Join / Leave
  document.getElementById('joinLeaveBtn')?.addEventListener('click', handleJoinLeave);

  // Post to group
  document.getElementById('postToGroupBtn')?.addEventListener('click', postToGroup);

  // Invite buttons
  document.getElementById('copyInviteBtn')?.addEventListener('click', () => {
    const input = document.getElementById('inviteLinkInput');
    if (input?.value) {
      navigator.clipboard.writeText(input.value);
      showToast('Invite link copied!', 'success');
    }
  });

  document.getElementById('copyCodeBtn')?.addEventListener('click', () => {
    const input = document.getElementById('inviteCodeInput');
    if (input?.value) {
      navigator.clipboard.writeText(input.value);
      showToast('Invite code copied!', 'success');
    }
  });

  document.getElementById('regenerateInviteBtn')?.addEventListener('click', async () => {
    const expiry = Number(document.getElementById('inviteExpiry')?.value || 7);
    const requireApproval = document.getElementById('inviteApproval')?.value === 'approval';
    await createOrRefreshInvite({ expiryDays: expiry, requireApproval });
  });
}

/**
 * Load group in real-time
 */
function loadGroup() {
  const groupRef = doc(db, 'groups', currentGroupId);

  if (unsubscribeGroup) unsubscribeGroup();

  unsubscribeGroup = onSnapshot(
    groupRef,
    (snap) => {
      if (!snap.exists()) {
        showToast('This group no longer exists', 'error');
        setTimeout(() => (window.location.href = 'groups.html'), 1500);
        return;
      }

      currentGroupData = { id: snap.id, ...snap.data() };
      renderGroupHeader(currentGroupData);
      renderMembers(currentGroupData);
      renderInviteUI();
      handleInviteJoin();
      loadGroupFeed();
    },
    (err) => {
      console.error(err);
      showToast('Failed to load group', 'error');
    }
  );
}

/**
 * Render header
 */
function renderGroupHeader(group) {
  document.getElementById('groupName').textContent = group.name || 'Unnamed Group';
  document.getElementById('groupDescription').textContent =
    group.description || 'No description provided.';
  document.getElementById('memberCount').textContent = `${group.memberCount || 1} members`;

  // Visibility badge
  const badge = document.getElementById('groupVisibilityBadge');
  if (badge) {
    const map = {
      public: { text: 'Public', class: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400' },
      network: { text: 'Network', class: 'border-sky-500/40 bg-sky-500/10 text-sky-400' },
      citizen_circle: { text: 'Citizen Circle', class: 'border-amber-500/40 bg-amber-500/10 text-amber-400' },
      witness_circle: { text: 'Witness Circle', class: 'border-cyan-500/40 bg-cyan-500/10 text-cyan-400' }
    };
    const info = map[group.visibility] || map.public;
    badge.textContent = info.text;
    badge.className = `rounded-full border px-2.5 py-0.5 text-xs ${info.class}`;
  }

  // Join / Leave button
  const btn = document.getElementById('joinLeaveBtn');
  const uid = auth.currentUser?.uid;
  const isMember = uid && group.members?.includes(uid);
  const isCreator = uid && group.creatorId === uid;

  if (btn) {
    if (isCreator) {
      btn.textContent = 'Creator';
      btn.disabled = true;
      btn.className = 'rounded-2xl bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-400 cursor-default';
    } else if (isMember) {
      btn.textContent = 'Leave Group';
      btn.disabled = false;
      btn.className = 'rounded-2xl bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700';
    } else {
      btn.textContent = 'Join Group';
      btn.disabled = false;
      btn.className = 'rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400';
    }
  }

  // Created date
  const createdEl = document.getElementById('groupCreatedAt');
  if (createdEl && group.createdAt?.toDate) {
    createdEl.textContent = group.createdAt.toDate().toLocaleString();
  }
}
updatePendingBadge(group);
/**
 * Render members + pending requests
 */
function renderMembers(group) {
  const list = document.getElementById('membersList');
  if (!list) return;

  list.innerHTML = '';

  const members = group.members || [];
  const admins = group.admins || [group.creatorId];
  const pending = group.pendingMembers || [];

  // Normal members
  if (members.length === 0) {
    list.innerHTML = `<p class="text-sm text-zinc-500 py-6 text-center">No members yet</p>`;
  } else {
    members.forEach((uid) => {
      const isAdmin = admins.includes(uid);
      const isCreator = uid === group.creatorId;

      const row = document.createElement('div');
      row.className = 'flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3';

      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700 text-sm font-medium">
            ${uid.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <p class="text-sm font-medium text-white">${uid.substring(0, 8)}...</p>
            <p class="text-xs text-zinc-500">
              ${isCreator ? 'Creator' : isAdmin ? 'Admin' : 'Member'}
            </p>
          </div>
        </div>
        ${isCreator || isAdmin
          ? `<span class="text-[10px] rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5">Admin</span>`
          : ''}
      `;
      list.appendChild(row);
    });
  }

  // Pending requests (only visible to admins)
  const uid = auth.currentUser?.uid;
  const isAdmin = uid && (group.creatorId === uid || (group.admins || []).includes(uid));

  if (isAdmin && pending.length > 0) {
    const title = document.createElement('h4');
    title.className = 'mt-6 mb-3 text-sm font-medium text-amber-400';
    title.textContent = `Pending Requests (${pending.length})`;
    list.appendChild(title);

    pending.forEach((pendingUid) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3';

      row.innerHTML = `
        <div class="text-sm text-zinc-300">${pendingUid.substring(0, 10)}...</div>
        <div class="flex gap-2">
          <button data-approve="${pendingUid}" class="rounded-lg bg-emerald-600 px-3 py-1 text-xs text-black hover:bg-emerald-500">
            Approve
          </button>
          <button data-reject="${pendingUid}" class="rounded-lg bg-zinc-700 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-600">
            Reject
          </button>
        </div>
      `;
      list.appendChild(row);
    });

    // Bind approve / reject
    list.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', () => approveMember(btn.dataset.approve));
    });
    list.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', () => rejectMember(btn.dataset.reject));
    });
  }
}

/**
 * Load group feed
 */
function loadGroupFeed() {
  const feedContainer = document.getElementById('groupFeed');
  if (!feedContainer) return;

  if (unsubscribeFeed) unsubscribeFeed();

  const q = query(
    collection(db, 'testimonies'),
    where('groupId', '==', currentGroupId),
    orderBy('createdAt', 'desc')
  );

  unsubscribeFeed = onSnapshot(q, (snapshot) => {
    feedContainer.innerHTML = '';

    if (snapshot.empty) {
      feedContainer.innerHTML = `
        <div class="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 py-14 text-center">
          <div class="mb-3 text-4xl">📭</div>
          <p class="text-zinc-400">No posts in this group yet</p>
          <p class="mt-1 text-xs text-zinc-500">Be the first to share something</p>
        </div>
      `;
      return;
    }

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const card = document.createElement('div');
      card.className = 'glass rounded-3xl p-5';

      card.innerHTML = `
        <div class="text-xs text-zinc-400 mb-2">
          ${data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : ''}
        </div>
        ${data.title ? `<h4 class="font-semibold text-white mb-1">${escapeHtml(data.title)}</h4>` : ''}
        <p class="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">
          ${escapeHtml(data.content || data.text || '')}
        </p>
      `;
      feedContainer.appendChild(card);
    });
  });
}

/**
 * Join or Leave
 */
async function handleJoinLeave() {
  if (!auth.currentUser) return showToast('Please sign in first', 'error');

  const uid = auth.currentUser.uid;
  const isMember = currentGroupData.members?.includes(uid);

  try {
    const groupRef = doc(db, 'groups', currentGroupId);

    if (isMember) {
      await updateDoc(groupRef, {
        members: arrayRemove(uid),
        memberCount: increment(-1)
      });
      showToast('You left the group', 'info');
    } else {
      await updateDoc(groupRef, {
        members: arrayUnion(uid),
        memberCount: increment(1)
      });
      showToast('Successfully joined the group!', 'success');
    }
  } catch (err) {
    console.error(err);
    showToast('Action failed', 'error');
  }
}

/**
 * Post inside the group
 */
async function postToGroup() {
  if (!auth.currentUser) return showToast('Please sign in to post', 'error');

  const input = document.getElementById('groupPostInput');
  const content = input?.value.trim();
  if (!content) return showToast('Write something first', 'error');

  try {
    await addDoc(collection(db, 'testimonies'), {
      content,
      text: content,
      groupId: currentGroupId,
      authorId: auth.currentUser.uid,
      author: auth.currentUser.displayName || 'Anonymous',
      isAnonymous: false,
      createdAt: serverTimestamp(),
      feedVisibility: 'group'
    });

    input.value = '';
    showToast('Posted to group', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to post', 'error');
  }
}

// ====================== INVITE SYSTEM ======================

function generateShortCode(groupName = '') {
  const prefix = (groupName || 'GRP')
    .replace(/[^a-zA-Z]/g, '')
    .substring(0, 5)
    .toUpperCase() || 'GRP';
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${random}`;
}

async function createOrRefreshInvite({ expiryDays = 7, requireApproval = true } = {}) {
  if (!currentGroupId || !auth.currentUser) return;

  const code = generateShortCode(currentGroupData?.name);
  const expiresAt = expiryDays > 0
    ? new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
    : null;

  const inviteData = {
    inviteCode: code,
    inviteEnabled: true,
    inviteRequireApproval: requireApproval,
    inviteExpiresAt: expiresAt,
    inviteCreatedAt: serverTimestamp(),
    inviteCreatedBy: auth.currentUser.uid
  };

  try {
    await updateDoc(doc(db, 'groups', currentGroupId), inviteData);
    showToast('Invite updated', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to update invite', 'error');
  }
}

function renderInviteUI() {
  const linkInput = document.getElementById('inviteLinkInput');
  const codeInput = document.getElementById('inviteCodeInput');
  const statusBadge = document.getElementById('inviteStatusBadge');
  const settings = document.getElementById('inviteSettings');

  if (!currentGroupData) return;

  const baseUrl = window.location.origin;
  const link = `${baseUrl}/group-detail.html?id=${currentGroupId}&code=${currentGroupData.inviteCode || ''}`;

  if (linkInput) linkInput.value = link;
  if (codeInput) codeInput.value = currentGroupData.inviteCode || '————';

  // Status
  if (statusBadge) {
    const expired = currentGroupData.inviteExpiresAt?.toDate
      ? currentGroupData.inviteExpiresAt.toDate() < new Date()
      : false;

    if (!currentGroupData.inviteEnabled || expired) {
      statusBadge.textContent = 'Expired / Disabled';
      statusBadge.className = 'text-xs text-red-400';
    } else {
      statusBadge.textContent = currentGroupData.inviteRequireApproval
        ? 'Requires Approval'
        : 'Auto-join Active';
      statusBadge.className = 'text-xs text-emerald-400';
    }
  }

  // Show settings only to admins
  const uid = auth.currentUser?.uid;
  const isAdmin = uid && (
    currentGroupData.creatorId === uid ||
    (currentGroupData.admins || []).includes(uid)
  );

  if (settings) {
    settings.classList.toggle('hidden', !isAdmin);
  }
}

async function handleInviteJoin() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const isInvite = params.get('invite') === '1' || !!code;

  if (!isInvite || !auth.currentUser || !currentGroupData) return;

  const uid = auth.currentUser.uid;

  if (currentGroupData.members?.includes(uid)) {
    cleanInviteFromUrl();
    return;
  }

  // Check expiration
  if (currentGroupData.inviteExpiresAt?.toDate) {
    if (currentGroupData.inviteExpiresAt.toDate() < new Date()) {
      showToast('This invite has expired', 'error');
      cleanInviteFromUrl();
      return;
    }
  }

  // Check code
  if (code && currentGroupData.inviteCode && code !== currentGroupData.inviteCode) {
    showToast('Invalid invite code', 'error');
    cleanInviteFromUrl();
    return;
  }

  try {
    const groupRef = doc(db, 'groups', currentGroupId);

    if (currentGroupData.inviteRequireApproval) {
      await updateDoc(groupRef, {
        pendingMembers: arrayUnion(uid)
      });
      showToast('Join request sent. Waiting for approval.', 'info');
    } else {
      await updateDoc(groupRef, {
        members: arrayUnion(uid),
        memberCount: increment(1),
        pendingMembers: arrayRemove(uid)
      });
      showToast('You joined the group!', 'success');
    }

    cleanInviteFromUrl();
  } catch (err) {
    console.error(err);
    showToast('Could not process invite', 'error');
  }
}

/**
 * Update the pending requests badge on the Members tab
 */
function updatePendingBadge(group) {
  const badge = document.getElementById('pendingBadge');
  if (!badge) return;

  const uid = auth.currentUser?.uid;
  const isAdmin = uid && (
    group.creatorId === uid ||
    (group.admins || []).includes(uid)
  );

  const pendingCount = (group.pendingMembers || []).length;

  if (isAdmin && pendingCount > 0) {
    badge.textContent = pendingCount;
    badge.classList.remove('hidden');
    badge.classList.add('flex');
  } else {
    badge.classList.add('hidden');
    badge.classList.remove('flex');
  }
}

function cleanInviteFromUrl() {
  const cleanUrl = `${window.location.pathname}?id=${currentGroupId}`;
  window.history.replaceState({}, '', cleanUrl);
}

async function approveMember(uid) {
  try {
    await updateDoc(doc(db, 'groups', currentGroupId), {
      members: arrayUnion(uid),
      pendingMembers: arrayRemove(uid),
      memberCount: increment(1)
    });
    showToast('Member approved', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to approve', 'error');
  }
}

async function rejectMember(uid) {
  try {
    await updateDoc(doc(db, 'groups', currentGroupId), {
      pendingMembers: arrayRemove(uid)
    });
    showToast('Request rejected', 'info');
  } catch (err) {
    console.error(err);
    showToast('Failed to reject', 'error');
  }
}

// Helper
function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
