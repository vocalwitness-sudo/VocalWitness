// js/group-detail.js
// Handles a single Group Detail page

import { db, auth } from './firebase-config.js';
import {
  doc,
  getDoc,
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
import { getCurrentUserTier, TIERS } from './tier.js';

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
    setTimeout(() => window.location.href = 'groups.html', 1500);
    return;
  }

  // Load group data in real-time
  loadGroup();

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('active', 'text-emerald-400');
        b.classList.add('text-zinc-400');
      });
      btn.classList.add('active', 'text-emerald-400');
      btn.classList.remove('text-zinc-400');

      document.querySelectorAll('[id^="tab-"]').forEach(t => t.classList.add('hidden'));
      const tab = btn.dataset.tab;
      document.getElementById(`tab-${tab}`)?.classList.remove('hidden');
    });
  });

  // Join / Leave button
  const joinBtn = document.getElementById('joinLeaveBtn');
  if (joinBtn) {
    joinBtn.addEventListener('click', handleJoinLeave);
  }

  // Post to group
  const postBtn = document.getElementById('postToGroupBtn');
  if (postBtn) {
    postBtn.addEventListener('click', postToGroup);
  }
}

/**
 * Load group info + members
 */
function loadGroup() {
  const groupRef = doc(db, 'groups', currentGroupId);

  if (unsubscribeGroup) unsubscribeGroup();

  unsubscribeGroup = onSnapshot(groupRef, async (snap) => {
    if (!snap.exists()) {
      showToast('This group no longer exists', 'error');
      setTimeout(() => window.location.href = 'groups.html', 1500);
      return;
    }

    currentGroupData = { id: snap.id, ...snap.data() };
    renderGroupHeader(currentGroupData);
    renderMembers(currentGroupData);
    loadGroupFeed();
  }, (err) => {
    console.error(err);
    showToast('Failed to load group', 'error');
  });
}

/**
 * Render header (name, description, visibility, member count, join button)
 */
function renderGroupHeader(group) {
  document.getElementById('groupName').textContent = group.name || 'Unnamed Group';
  document.getElementById('groupDescription').textContent = group.description || 'No description provided.';
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

  // Join / Leave button state
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

/**
 * Render members list
 */
function renderMembers(group) {
  const list = document.getElementById('membersList');
  if (!list) return;

  list.innerHTML = '';

  const members = group.members || [];
  const admins = group.admins || [group.creatorId];

  if (members.length === 0) {
    list.innerHTML = `<p class="text-sm text-zinc-500 py-6 text-center">No members yet</p>`;
    return;
  }

  members.forEach(uid => {
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

/**
 * Load group feed (posts inside this group)
 */
function loadGroupFeed() {
  const feedContainer = document.getElementById('groupFeed');
  if (!feedContainer) return;

  if (unsubscribeFeed) unsubscribeFeed();

  // Assuming posts that belong to a group have a field: groupId
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

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const card = document.createElement('div');
      card.className = 'glass rounded-3xl p-5';

      card.innerHTML = `
        <div class="flex items-start justify-between gap-3 mb-3">
          <div class="text-xs text-zinc-400">
            ${data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString() : ''}
          </div>
        </div>
        ${data.title ? `<h4 class="font-semibold text-white mb-1">${escapeHtml(data.title)}</h4>` : ''}
        <p class="text-zinc-200 text-sm leading-relaxed whitespace-pre-wrap">${escapeHtml(data.content || data.text || '')}</p>
      `;

      feedContainer.appendChild(card);
    });
  });
}

/**
 * Join or Leave the group
 */
async function handleJoinLeave() {
  if (!auth.currentUser) {
    return showToast('Please sign in first', 'error');
  }

  const uid = auth.currentUser.uid;
  const isMember = currentGroupData.members?.includes(uid);

  try {
    const groupRef = doc(db, 'groups', currentGroupId);

    if (isMember) {
      // Leave
      await updateDoc(groupRef, {
        members: arrayRemove(uid),
        memberCount: increment(-1)
      });
      showToast('You left the group', 'info');
    } else {
      // Join
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
 * Post a message / testimony inside the group
 */
async function postToGroup() {
  if (!auth.currentUser) {
    return showToast('Please sign in to post', 'error');
  }

  const input = document.getElementById('groupPostInput');
  const content = input?.value.trim();

  if (!content) {
    return showToast('Write something first', 'error');
  }

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
