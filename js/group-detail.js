// js/group-detail.js
// Complete Group Detail page with Invite Code, Approval,
// and the 3 Core Institutional Tools (Evidence Locker, Attestation Wall, Forensic Timeline)
// Updated: Real file picker + client-side SHA-256 for Evidence Locker

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
  serverTimestamp,
  getDocs,
  limit
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

import { showToast } from './utils.js';

let currentGroupId = null;
let currentGroupData = null;
let unsubscribeGroup = null;
let unsubscribeFeed = null;
let unsubscribeEvidence = null;
let unsubscribeAttestations = null;
let unsubscribeTimeline = null;

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

  // Support deep-link tab (e.g. ?tab=locker)
  const initialTab = params.get('tab');
  if (initialTab) {
    const btn = document.querySelector(`.tab-btn[data-tab="${initialTab}"]`);
    if (btn) btn.click();
  }

  // Join / Leave
  document.getElementById('joinLeaveBtn')?.addEventListener('click', handleJoinLeave);

  // Post to group feed
  document.getElementById('postToGroupBtn')?.addEventListener('click', postToGroup);

  // Core Tool buttons
  document.getElementById('openEvidenceModalBtn')?.addEventListener('click', promptDepositEvidence);
  document.getElementById('openAttestationModalBtn')?.addEventListener('click', promptSignAttestation);
  document.getElementById('openTimelineModalBtn')?.addEventListener('click', promptAddTimelineNode);

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
      loadGroupFeed();
      loadEvidenceLocker();
      loadAttestationWall();
      loadForensicTimeline();
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

  const createdEl = document.getElementById('groupCreatedAt');
  if (createdEl && group.createdAt?.toDate) {
    createdEl.textContent = group.createdAt.toDate().toLocaleString();
  }
}

/**
 * Render members + pending requests
 */
function renderMembers(group) {
  const list = document.getElementById('membersList');
  if (!list) return;

  updatePendingBadge(group);
  list.innerHTML = '';

  const members = group.members || [];
  const admins = group.admins || [group.creatorId];
  const pending = group.pendingMembers || [];

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

    list.querySelectorAll('[data-approve]').forEach((btn) => {
      btn.addEventListener('click', () => approveMember(btn.dataset.approve));
    });
    list.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', () => rejectMember(btn.dataset.reject));
    });
  }
}

function updatePendingBadge(group) {
  const badge = document.getElementById('pendingBadge');
  if (!badge) return;
  const count = (group.pendingMembers || []).length;
  if (count > 0) {
    badge.textContent = count;
    badge.classList.remove('hidden');
    badge.classList.add('flex');
  } else {
    badge.classList.add('hidden');
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

// ====================== 3 CORE INSTITUTIONAL TOOLS ======================

/**
 * 1. Evidence Locker
 */
function loadEvidenceLocker() {
  const container = document.getElementById('evidenceList');
  if (!container) return;

  if (unsubscribeEvidence) unsubscribeEvidence();

  const q = query(
    collection(db, 'group_evidence'),
    where('groupId', '==', currentGroupId),
    orderBy('createdAt', 'desc')
  );

  unsubscribeEvidence = onSnapshot(q, (snapshot) => {
    container.innerHTML = '';

    if (snapshot.empty) {
      container.innerHTML = `
        <div class="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 py-14 text-center col-span-full">
          <div class="mb-3 text-4xl">🗄️</div>
          <p class="text-zinc-400">No evidence deposited yet</p>
          <p class="mt-1 text-xs text-zinc-500">Click "+ Deposit Evidence" to seal a file with SHA-256</p>
        </div>
      `;
      return;
    }

    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      const card = document.createElement('div');
      card.className = 'glass p-4 rounded-2xl flex flex-col space-y-2';

      card.innerHTML = `
        <div class="flex justify-between items-start gap-2">
          <span class="text-xs font-medium text-emerald-400 truncate">${escapeHtml(item.name)}</span>
          <span class="text-[10px] bg-emerald-950 text-emerald-300 px-2 py-0.5 rounded border border-emerald-800 shrink-0">
            ${escapeHtml(item.status || 'Sealed')}
          </span>
        </div>
        <div class="text-[11px] text-zinc-400 flex justify-between">
          <span>${escapeHtml(item.size || 'Unknown')}</span>
          <span>${item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : ''}</span>
        </div>
        <div class="text-[10px] font-mono text-zinc-500 bg-zinc-900 p-1.5 rounded truncate">
          SHA-256: ${escapeHtml(item.hash)}
        </div>
      `;
      container.appendChild(card);
    });
  });
}

// ============================================================
// REAL EVIDENCE LOCKER – File picker + Client-side SHA-256
// ============================================================
async function promptDepositEvidence() {
  if (!auth.currentUser) {
    showToast('Please sign in to deposit evidence', 'error');
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip';
  input.multiple = false;

  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 80 * 1024 * 1024) {
      showToast('File too large (max 80 MB)', 'error');
      return;
    }

    try {
      showToast('Hashing evidence on your device…', 'info');

      const buffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      await addDoc(collection(db, 'group_evidence'), {
        groupId: currentGroupId,
        name: file.name,
        size: formatBytes(file.size),
        mimeType: file.type || 'application/octet-stream',
        hash: hashHex,
        hashAlg: 'SHA-256',
        url: null,
        depositedBy: auth.currentUser.uid,
        status: 'Sealed (SHA-256)',
        createdAt: serverTimestamp()
      });

      showToast('Evidence deposited & sealed', 'success');
    } catch (err) {
      console.error(err);
      showToast('Failed to deposit evidence', 'error');
    }
  };

  input.click();
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
/**
 * 2. Attestation Wall (basic)
 */
function loadAttestationWall() {
  const container = document.getElementById('attestationList');
  if (!container) return;

  container.innerHTML = `
    <div class="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 py-14 text-center">
      <div class="mb-3 text-4xl">📜</div>
      <p class="text-zinc-400">No attestations yet</p>
    </div>
  `;
}

async function promptSignAttestation() {
  if (!auth.currentUser) return showToast('Please sign in', 'error');
  const text = prompt('Enter your attestation statement:');
  if (!text) return;
  showToast('Attestation feature coming soon', 'info');
}

/**
 * 3. Forensic Timeline (basic)
 */
function loadForensicTimeline() {
  const container = document.getElementById('forensicTimelineStream');
  if (!container) return;

  container.innerHTML = `
    <div class="text-zinc-500 text-sm py-8">No timeline nodes yet</div>
  `;
}

async function promptAddTimelineNode() {
  if (!auth.currentUser) return showToast('Please sign in', 'error');
  const text = prompt('Describe the timeline event:');
  if (!text) return;
  showToast('Timeline feature coming soon', 'info');
}

// ====================== JOIN / LEAVE / POST ======================

async function handleJoinLeave() {
  if (!auth.currentUser || !currentGroupData) return;

  const uid = auth.currentUser.uid;
  const isMember = currentGroupData.members?.includes(uid);

  try {
    if (isMember) {
      await updateDoc(doc(db, 'groups', currentGroupId), {
        members: arrayRemove(uid),
        memberCount: increment(-1)
      });
      showToast('Left the group', 'info');
    } else {
      await updateDoc(doc(db, 'groups', currentGroupId), {
        members: arrayUnion(uid),
        memberCount: increment(1)
      });
      showToast('Joined the group!', 'success');
    }
  } catch (err) {
    console.error(err);
    showToast('Action failed', 'error');
  }
}

async function postToGroup() {
  if (!auth.currentUser) return showToast('Please sign in', 'error');

  const input = document.getElementById('groupPostInput');
  const content = input?.value?.trim();
  if (!content) return showToast('Write something first', 'error');

  try {
    await addDoc(collection(db, 'testimonies'), {
      content,
      groupId: currentGroupId,
      authorId: auth.currentUser.uid,
      channel: 'group',
      createdAt: serverTimestamp()
    });
    input.value = '';
    showToast('Posted', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to post', 'error');
  }
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
  }
}

function renderInviteUI() {
  const linkInput = document.getElementById('inviteLinkInput');
  const codeInput = document.getElementById('inviteCodeInput');
  if (linkInput) {
    linkInput.value = `${window.location.origin}/group-detail.html?id=${currentGroupId}`;
  }
  if (codeInput && currentGroupData?.inviteCode) {
    codeInput.value = currentGroupData.inviteCode;
  }
}

// ====================== HELPERS ======================

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
