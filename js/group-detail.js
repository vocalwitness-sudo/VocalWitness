// js/group-detail.js - VocalWitness Group Detail System
// Fixed: init wiring, sealed evidence upload (hash + media), admin moderation

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

import { showToast, computeSHA256 } from './utils.js';
import {
  removeGroupMember,
  expelGroupMember,
  unbanGroupMember,
  approveGroupMember,
  rejectGroupMember
} from './groups.js';
import { exportGroupEvidencePackage } from './export-package.js';
import { uploadMedia } from './upload.js';

let currentGroupId = null;
let currentGroupData = null;
let unsubscribeGroup = null;
let unsubscribeFeed = null;
let unsubscribeEvidence = null;
let unsubscribeAttestations = null;
let unsubscribeTimeline = null;

const MAX_EVIDENCE_BYTES = 80 * 1024 * 1024; // 80 MB
const ALLOWED_EVIDENCE_EXT = /\.(jpe?g|png|webp|gif|heic|heif|mp3|wav|ogg|m4a|webm|mp4|mov|mkv|m4v|pdf|txt|zip|doc|docx)$/i;

/**
 * Main entry point — all wiring lives inside this function
 */
export function initGroupDetail() {
  const params = new URLSearchParams(window.location.search);
  currentGroupId = params.get('id');

  if (!currentGroupId) {
    showToast('Group not found', 'error');
    setTimeout(() => (window.location.href = 'groups.html'), 1500);
    return;
  }

  // Export package
  document.getElementById('exportEvidencePackageBtn')?.addEventListener('click', () => {
    if (currentGroupId) exportGroupEvidencePackage(currentGroupId);
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.remove('active');
        b.classList.add('text-zinc-400');
      });
      btn.classList.add('active');
      btn.classList.remove('text-zinc-400');

      document.querySelectorAll('[id^="tab-"]').forEach((t) => t.classList.add('hidden'));
      const tab = btn.dataset.tab;
      document.getElementById(`tab-${tab}`)?.classList.remove('hidden');
    });
  });

  // Deep-link tab support (?tab=locker | attestation | timeline | members | about)
  const initialTab = params.get('tab');
  if (initialTab) {
    setTimeout(() => {
      const btn = document.querySelector(`.tab-btn[data-tab="${initialTab}"]`);
      if (btn) btn.click();
    }, 150);
  }

  // Join / Leave
  document.getElementById('joinLeaveBtn')?.addEventListener('click', handleJoinLeave);

  // Post to group feed
  document.getElementById('postToGroupBtn')?.addEventListener('click', postToGroup);

  // Core Tool buttons
  document.getElementById('openEvidenceModalBtn')?.addEventListener('click', promptDepositEvidence);
  document.getElementById('openAttestationModalBtn')?.addEventListener('click', promptSignAttestation);
  document.getElementById('openTimelineModalBtn')?.addEventListener('click', promptAddTimelineNode);

  // Invite copy buttons
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

  loadGroup();
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
      renderAdminMemberPanel(currentGroupData);
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
      btn.className =
        'rounded-2xl bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-400 cursor-default';
    } else if (isMember) {
      btn.textContent = 'Leave Group';
      btn.disabled = false;
      btn.className =
        'rounded-2xl bg-zinc-800 px-5 py-2.5 text-sm font-medium text-zinc-300 hover:bg-zinc-700';
    } else {
      btn.textContent = 'Join Group';
      btn.disabled = false;
      btn.className =
        'rounded-2xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-black hover:bg-emerald-400';
    }
  }

  const createdEl = document.getElementById('groupCreatedAt');
  if (createdEl && group.createdAt?.toDate) {
    createdEl.textContent = group.createdAt.toDate().toLocaleString();
  }
}

/**
 * Render members + pending requests (standard list)
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
      row.className =
        'flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3';

      row.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-700 text-sm font-medium">
            ${uid.substring(0, 2).toUpperCase()}
          </div>
          <div>
            <p class="text-sm font-medium text-white">${uid.substring(0, 8)}…</p>
            <p class="text-xs text-zinc-500">
              ${isCreator ? 'Creator' : isAdmin ? 'Admin' : 'Member'}
            </p>
          </div>
        </div>
        ${
          isCreator || isAdmin
            ? `<span class="text-[10px] rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5">Admin</span>`
            : ''
        }
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
      row.className =
        'flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3';

      row.innerHTML = `
        <div class="text-sm text-zinc-300">${pendingUid.substring(0, 10)}…</div>
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
      btn.addEventListener('click', () => approveGroupMember(currentGroupId, btn.dataset.approve));
    });
    list.querySelectorAll('[data-reject]').forEach((btn) => {
      btn.addEventListener('click', () => rejectGroupMember(currentGroupId, btn.dataset.reject));
    });
  }
}

/**
 * Admin Member Management Panel
 */
function renderAdminMemberPanel(groupData) {
  const panel = document.getElementById('admin-members-panel');
  if (!panel) return;

  const currentUid = auth.currentUser?.uid;
  const isAdmin = groupData.admins?.includes(currentUid) || groupData.creatorId === currentUid;

  if (!isAdmin) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');

  // Pending
  const pendingContainer = document.getElementById('pending-members-list');
  const pendingCountEl = document.getElementById('pending-count');
  const pending = groupData.pendingMembers || [];
  if (pendingCountEl) pendingCountEl.textContent = pending.length;

  if (pending.length === 0 && pendingContainer) {
    pendingContainer.innerHTML = `<div class="p-3 text-center text-xs text-zinc-500 rounded-xl bg-zinc-900/40 border border-zinc-800/80">No pending join requests</div>`;
  } else if (pendingContainer) {
    pendingContainer.innerHTML = pending
      .map(
        (uid) => `
      <div class="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/90 p-3 text-xs">
        <span class="font-mono text-zinc-300">${uid.slice(0, 12)}...</span>
        <div class="flex items-center gap-2">
          <button type="button" class="approve-member-btn px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40 font-semibold transition" data-uid="${uid}">
            ✓ Approve
          </button>
          <button type="button" class="reject-member-btn px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 font-medium transition" data-uid="${uid}">
            ✕ Decline
          </button>
        </div>
      </div>
    `
      )
      .join('');
  }

  // Active
  const activeContainer = document.getElementById('active-members-list');
  const activeCountEl = document.getElementById('active-count');
  const members = groupData.members || [];
  if (activeCountEl) activeCountEl.textContent = members.length;

  if (activeContainer) {
    activeContainer.innerHTML = members
      .map((uid) => {
        const isOwner = uid === groupData.creatorId;
        return `
        <div class="flex items-center justify-between rounded-2xl border border-zinc-800/80 bg-zinc-900/60 p-3 text-xs">
          <div class="flex items-center gap-2">
            <span class="font-mono text-zinc-300">${uid.slice(0, 12)}...</span>
            ${isOwner ? '<span class="text-[10px] bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full border border-amber-500/30">Owner</span>' : ''}
          </div>
          ${
            !isOwner && uid !== currentUid
              ? `
            <div class="flex items-center gap-2">
              <button type="button" class="remove-member-btn px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 font-medium transition" data-uid="${uid}">
                Remove
              </button>
              <button type="button" class="expel-member-btn px-3 py-1.5 rounded-xl bg-red-500/15 text-red-400 hover:bg-red-500/25 border border-red-500/30 font-semibold transition" data-uid="${uid}">
                🚫 Expel & Ban
              </button>
            </div>
          `
              : ''
          }
        </div>
      `;
      })
      .join('');
  }

  // Banned
  const bannedContainer = document.getElementById('banned-members-list');
  const bannedCountEl = document.getElementById('banned-count');
  const banned = groupData.bannedMembers || [];
  if (bannedCountEl) bannedCountEl.textContent = banned.length;

  if (banned.length === 0 && bannedContainer) {
    bannedContainer.innerHTML = `<div class="p-3 text-center text-xs text-zinc-500 rounded-xl bg-zinc-900/40 border border-zinc-800/80">No banned members</div>`;
  } else if (bannedContainer) {
    bannedContainer.innerHTML = banned
      .map(
        (uid) => `
      <div class="flex items-center justify-between rounded-2xl border border-red-500/20 bg-red-950/20 p-3 text-xs">
        <span class="font-mono text-red-300">${uid.slice(0, 12)}... (Banned)</span>
        <button type="button" class="unban-member-btn px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 font-medium transition" data-uid="${uid}">
          Unban
        </button>
      </div>
    `
      )
      .join('');
  }

  // Listeners
  pendingContainer?.querySelectorAll('.approve-member-btn').forEach((btn) => {
    btn.addEventListener('click', async () => await approveGroupMember(groupData.id, btn.dataset.uid));
  });
  pendingContainer?.querySelectorAll('.reject-member-btn').forEach((btn) => {
    btn.addEventListener('click', async () => await rejectGroupMember(groupData.id, btn.dataset.uid));
  });
  activeContainer?.querySelectorAll('.remove-member-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (confirm('Remove this member? They can re-join later via invite link.')) {
        await removeGroupMember(groupData.id, btn.dataset.uid);
      }
    });
  });
  activeContainer?.querySelectorAll('.expel-member-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (
        confirm(
          '🚫 EXPEL & BAN MEMBER?\n\nThis user will be permanently blocked from re-joining this group until unbanned.'
        )
      ) {
        await expelGroupMember(groupData.id, btn.dataset.uid);
      }
    });
  });
  bannedContainer?.querySelectorAll('.unban-member-btn').forEach((btn) => {
    btn.addEventListener('click', async () => await unbanGroupMember(groupData.id, btn.dataset.uid));
  });
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
    badge.classList.remove('flex');
  }
}

/**
 * Group discussion feed
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

// ====================== EVIDENCE LOCKER (SEALED) ======================

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

      const mediaLink = item.url
        ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="text-[11px] text-sky-400 hover:underline truncate">Open media →</a>`
        : `<span class="text-[11px] text-zinc-600">Hash-only (no media URL)</span>`;

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
        ${mediaLink}
      `;
      container.appendChild(card);
    });
  });
}

/**
 * Deposit evidence:
 * 1. Client-side SHA-256 of the original file
 * 2. Upload media to sealed R2 path (group-evidence/{groupId}/...)
 * 3. Write immutable Firestore record (create-only under rules)
 */
async function promptDepositEvidence() {
  if (!auth.currentUser) {
    showToast('Please sign in to deposit evidence', 'error');
    return;
  }

  // Must be a member (or creator)
  const uid = auth.currentUser.uid;
  const isMember =
    currentGroupData?.members?.includes(uid) || currentGroupData?.creatorId === uid;
  if (!isMember) {
    showToast('Join the group before depositing evidence', 'error');
    return;
  }

  if (currentGroupData?.bannedMembers?.includes(uid)) {
    showToast('You are banned from this group', 'error');
    return;
  }

  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip';
  input.multiple = false;

  input.onchange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_EVIDENCE_BYTES) {
      showToast('File too large (max 80 MB)', 'error');
      return;
    }

    if (!ALLOWED_EVIDENCE_EXT.test(file.name || '')) {
      showToast('File type not allowed for group evidence', 'error');
      return;
    }

    try {
      showToast('Hashing evidence on your device…', 'info');

      // 1. Client-side SHA-256 of the original bytes (before any transform)
      const hashHex = await computeSHA256(file);
      if (!hashHex || hashHex.length !== 64) {
        throw new Error('Failed to compute SHA-256 hash');
      }

      // 2. Upload to sealed path under group-evidence/{groupId}/
      //    Images get EXIF scrub via uploadMedia; hash above is of original file.
      showToast('Uploading sealed media…', 'info');
      const folderPath = `group-evidence/${currentGroupId}`;
      let publicUrl = null;

       // 2. Upload to sealed path under group-evidence/{groupId}/
      //    Hash above is of the original file bytes (before any image scrub).
      showToast('Uploading sealed file…', 'info');
      const folderPath = `group-evidence/${currentGroupId}`;
      const publicUrl = await uploadMedia(file, folderPath);
     
      
      // 3. Immutable Firestore record
      await addDoc(collection(db, 'group_evidence'), {
        groupId: currentGroupId,
        name: file.name,
        size: formatBytes(file.size),
        sizeBytes: file.size,
        mimeType: file.type || 'application/octet-stream',
        hash: hashHex,
        hashAlg: 'SHA-256',
        url: publicUrl,
        storagePath: publicUrl
          ? publicUrl.replace('https://media.vocalwitness.com/', '')
          : null,
        depositedBy: auth.currentUser.uid,
        status: publicUrl ? 'Sealed (SHA-256 + media)' : 'Sealed (SHA-256 hash only)',
        createdAt: serverTimestamp()
      });

      showToast('Evidence deposited & sealed', 'success');
    } catch (err) {
      console.error(err);
      showToast(err?.message || 'Failed to deposit evidence', 'error');
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

// ====================== ATTESTATION WALL ======================

function loadAttestationWall() {
  const container = document.getElementById('attestationList');
  if (!container) return;

  if (unsubscribeAttestations) unsubscribeAttestations();

  const q = query(
    collection(db, 'group_attestations'),
    where('groupId', '==', currentGroupId),
    orderBy('createdAt', 'desc')
  );

  unsubscribeAttestations = onSnapshot(q, (snapshot) => {
    container.innerHTML = '';

    if (snapshot.empty) {
      container.innerHTML = `
        <div class="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 py-14 text-center">
          <div class="mb-3 text-4xl">📜</div>
          <p class="text-zinc-400">No attestations yet</p>
          <p class="mt-1 text-xs text-zinc-500">Be the first to sign a statement</p>
        </div>
      `;
      return;
    }

    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      const card = document.createElement('div');
      card.className = 'glass p-4 rounded-2xl';

      card.innerHTML = `
        <p class="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">${escapeHtml(item.statement)}</p>
        <div class="mt-3 flex justify-between items-center text-[11px] text-zinc-500">
          <span>${item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : ''}</span>
          <span class="font-mono">${(item.signedBy || '').substring(0, 8)}…</span>
        </div>
      `;
      container.appendChild(card);
    });
  });
}

async function promptSignAttestation() {
  if (!auth.currentUser) {
    showToast('Please sign in', 'error');
    return;
  }

  const statement = prompt('Enter your attestation statement:');
  if (!statement?.trim()) return;

  try {
    await addDoc(collection(db, 'group_attestations'), {
      groupId: currentGroupId,
      statement: statement.trim().slice(0, 1000),
      signedBy: auth.currentUser.uid,
      createdAt: serverTimestamp()
    });
    showToast('Attestation signed', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to sign attestation', 'error');
  }
}

// ====================== FORENSIC TIMELINE ======================

function loadForensicTimeline() {
  const container = document.getElementById('forensicTimelineStream');
  if (!container) return;

  if (unsubscribeTimeline) unsubscribeTimeline();

  const q = query(
    collection(db, 'group_timeline'),
    where('groupId', '==', currentGroupId),
    orderBy('eventTime', 'asc')
  );

  unsubscribeTimeline = onSnapshot(q, (snapshot) => {
    container.innerHTML = '';

    if (snapshot.empty) {
      container.innerHTML = `
        <div class="text-zinc-500 text-sm py-8 text-center">No timeline nodes yet</div>
      `;
      return;
    }

    snapshot.forEach((docSnap) => {
      const item = docSnap.data();
      const node = document.createElement('div');
      node.className = 'relative';

      node.innerHTML = `
        <div class="absolute -left-[21px] top-1.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-[#070b14]"></div>
        <div class="glass rounded-2xl p-4">
          <p class="text-sm text-zinc-200">${escapeHtml(item.description)}</p>
          <div class="mt-2 text-[11px] text-zinc-500">
            ${item.eventTime?.toDate ? item.eventTime.toDate().toLocaleString() : ''}
          </div>
        </div>
      `;
      container.appendChild(node);
    });
  });
}

async function promptAddTimelineNode() {
  if (!auth.currentUser) {
    showToast('Please sign in', 'error');
    return;
  }

  const description = prompt('Describe the timeline event:');
  if (!description?.trim()) return;

  try {
    await addDoc(collection(db, 'group_timeline'), {
      groupId: currentGroupId,
      description: description.trim().slice(0, 500),
      eventTime: serverTimestamp(),
      addedBy: auth.currentUser.uid,
      createdAt: serverTimestamp()
    });
    showToast('Timeline node added', 'success');
  } catch (err) {
    console.error(err);
    showToast('Failed to add timeline node', 'error');
  }
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
        admins: arrayRemove(uid),
        memberCount: increment(-1)
      });
      showToast('Left the group', 'info');
    } else {
      if (currentGroupData.bannedMembers?.includes(uid)) {
        return showToast('❌ You have been expelled from this group and cannot join.', 'error');
      }
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
  if (!auth.currentUser) {
    showToast('Please sign in', 'error');
    return;
  }

  const input = document.getElementById('groupPostInput');
  const content = input?.value?.trim();
  if (!content) {
    showToast('Write something first', 'error');
    return;
  }

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

function renderInviteUI() {
  const linkInput = document.getElementById('inviteLinkInput');
  const codeInput = document.getElementById('inviteCodeInput');

  if (linkInput) {
    linkInput.value = `${window.location.origin}/groups.html?join=${currentGroupId}`;
  }

  if (codeInput) {
    codeInput.value = currentGroupData?.inviteCode || currentGroupId.substring(0, 8).toUpperCase();
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
