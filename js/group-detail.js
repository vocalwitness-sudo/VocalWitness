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
  serverTimestamp,
  limit, startAfter, getDocs
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
import { assertRateLimit, RL } from './rate-limit.js';
import { getPublicProfiles, profileChipHtml } from './profile-cache.js';

let currentGroupId = null;
let currentGroupData = null;
let unsubscribeGroup = null;
let unsubscribeFeed = null;
let unsubscribeEvidence = null;
let unsubscribeAttestations = null;
let unsubscribeTimeline = null;

const EVIDENCE_PAGE = 20;
let evidenceCursor = null;       // last DocumentSnapshot
let evidenceHasMore = false;
let evidenceLoadingMore = false;

const FEED_PAGE = 15;
let feedCursor = null;
let feedHasMore = false;
let feedLoadingMore = false;

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

  // Core Tool buttons → open modals (not browser prompt)
  document.getElementById('openAttestationModalBtn')?.addEventListener('click', openAttestationModal);
  document.getElementById('openTimelineModalBtn')?.addEventListener('click', openTimelineModal);
  document.getElementById('openEvidenceModalBtn')?.addEventListener('click', openEvidenceModal);

  // Modal chrome (✕ + backdrop click)
  wireModalChrome('attestationModal', 'closeAttestationModalBtn');
  wireModalChrome('timelineModal', 'closeTimelineModalBtn');
  wireModalChrome('evidenceModal', 'closeEvidenceModalBtn');

  // Attestation char counter
  document.getElementById('attestationStatementInput')?.addEventListener('input', (e) => {
    const n = (e.target.value || '').length;
    const el = document.getElementById('attestationCharCount');
    if (el) el.textContent = `${n} / 1000`;
  });

  // Modal confirm actions
  document.getElementById('confirmAttestationBtn')?.addEventListener('click', submitAttestationFromModal);
  document.getElementById('confirmTimelineBtn')?.addEventListener('click', submitTimelineFromModal);
  document.getElementById('confirmEvidenceBtn')?.addEventListener('click', submitEvidenceFromModal);

  // Evidence file picker
  document.getElementById('evidenceFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0] || null;
    window.__pendingEvidenceFile = file;
    const nameEl = document.getElementById('evidenceFileName');
    const btn = document.getElementById('confirmEvidenceBtn');
    if (nameEl) nameEl.textContent = file ? file.name : '';
    if (btn) btn.disabled = !file;
  });

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
async function renderMembers(group) {
  const list = document.getElementById('membersList');
  if (!list) return;

  updatePendingBadge(group);
  list.innerHTML = `<p class="text-sm text-zinc-500 py-4 text-center">Loading members…</p>`;

  const members = group.members || [];
  const admins = group.admins || [group.creatorId];
  const pending = group.pendingMembers || [];

  const allUids = [...new Set([...members, ...pending])];
  const profiles = await getPublicProfiles(allUids);

  list.innerHTML = '';

  if (members.length === 0) {
    list.innerHTML = `<p class="text-sm text-zinc-500 py-6 text-center">No members yet</p>`;
  } else {
    members.forEach((uid) => {
      const isAdmin = admins.includes(uid);
      const isCreator = uid === group.creatorId;
      const profile = profiles[uid] || { displayName: uid.substring(0, 8) + '…', photoURL: null };
      const chip = profileChipHtml(profile, escapeHtml);

      const row = document.createElement('div');
      row.className =
        'flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/60 px-4 py-3';

      row.innerHTML = `
        <div class="flex items-center gap-3 min-w-0">
          <div class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-sm font-medium">
            ${chip.avatarInner}
          </div>
          <div class="min-w-0">
            <p class="truncate text-sm font-medium text-white">${chip.name}</p>
            <p class="text-xs text-zinc-500">
              ${isCreator ? 'Creator' : isAdmin ? 'Admin' : 'Member'}
              ${chip.username ? ` · ${chip.username}` : ''}
            </p>
          </div>
        </div>
        ${
          isCreator || isAdmin
            ? `<span class="shrink-0 text-[10px] rounded-full bg-amber-500/15 text-amber-400 px-2 py-0.5">Admin</span>`
            : ''
        }
      `;
      list.appendChild(row);
    });
  }

  const uid = auth.currentUser?.uid;
  const isAdminUser = uid && (group.creatorId === uid || (group.admins || []).includes(uid));

  if (isAdminUser && pending.length > 0) {
    const title = document.createElement('h4');
    title.className = 'mt-6 mb-3 text-sm font-medium text-amber-400';
    title.textContent = `Pending Requests (${pending.length})`;
    list.appendChild(title);

    pending.forEach((pendingUid) => {
      const profile = profiles[pendingUid] || { displayName: pendingUid.substring(0, 10) + '…' };
      const chip = profileChipHtml(profile, escapeHtml);

      const row = document.createElement('div');
      row.className =
        'flex items-center justify-between rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 gap-2';

      row.innerHTML = `
        <div class="flex items-center gap-2 min-w-0">
          <div class="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-xs">
            ${chip.avatarInner}
          </div>
          <span class="truncate text-sm text-zinc-300">${chip.name}</span>
        </div>
        <div class="flex gap-2 shrink-0">
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
async function renderAdminMemberPanel(groupData) {
  const panel = document.getElementById('admin-members-panel');
  if (!panel) return;

  const currentUid = auth.currentUser?.uid;
  const isAdmin = groupData.admins?.includes(currentUid) || groupData.creatorId === currentUid;

  if (!isAdmin) {
    panel.classList.add('hidden');
    return;
  }
  panel.classList.remove('hidden');

  // Extract lists (declare once — used below for pending / active / banned)
  const pending = groupData.pendingMembers || [];
  const banned = groupData.bannedMembers || [];

  // Fetch profiles for all unique UIDs across pending, members, and banned lists
  const allUids = [...new Set([...pending, ...members, ...banned])];
  const profiles = await getPublicProfiles(allUids);

  // Pending
  const pendingContainer = document.getElementById('pending-members-list');
  const pendingCountEl = document.getElementById('pending-count');
  if (pendingCountEl) pendingCountEl.textContent = pending.length;

  if (pending.length === 0 && pendingContainer) {
    pendingContainer.innerHTML = `<div class="p-3 text-center text-xs text-zinc-500 rounded-xl bg-zinc-900/40 border border-zinc-800/80">No pending join requests</div>`;
  } else if (pendingContainer) {
    pendingContainer.innerHTML = pending
      .map((uid) => {
        const p = profiles[uid] || { displayName: uid.slice(0, 12) + '...', photoURL: null };
        const chip = profileChipHtml(p, escapeHtml);

        return `
        <div class="flex items-center justify-between rounded-2xl border border-zinc-800 bg-zinc-900/90 p-3 text-xs">
          <div class="flex items-center gap-2 min-w-0">
            <div class="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-xs">
              ${chip.avatarInner}
            </div>
            <span class="truncate text-zinc-300 font-medium">${chip.name}</span>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <button type="button" class="approve-member-btn px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/40 font-semibold transition" data-uid="${uid}">
              ✓ Approve
            </button>
            <button type="button" class="reject-member-btn px-3 py-1.5 rounded-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 font-medium transition" data-uid="${uid}">
              ✕ Decline
            </button>
          </div>
        </div>
      `;
      })
      .join('');
  }
  // Active
  const activeContainer = document.getElementById('active-members-list');
  const activeCountEl = document.getElementById('active-count');
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

  if (unsubscribeEvidence) {
    unsubscribeEvidence();
    unsubscribeEvidence = null;
  }
  evidenceCursor = null;
  evidenceHasMore = false;

  const q = query(
    collection(db, 'group_evidence'),
    where('groupId', '==', currentGroupId),
    orderBy('createdAt', 'desc'),
    limit(EVIDENCE_PAGE)
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
      removeLoadMoreBtn('evidenceLoadMore');
      return;
    }

    evidenceCursor = snapshot.docs[snapshot.docs.length - 1] || null;
    evidenceHasMore = snapshot.docs.length >= EVIDENCE_PAGE;

    snapshot.forEach((docSnap) => {
      container.appendChild(buildEvidenceCard(docSnap.data()));
    });

    ensureLoadMoreBtn({
      id: 'evidenceLoadMore',
      parent: container.parentElement || container,
      label: 'Load more evidence',
      onClick: () => loadMoreEvidence()
    });
    setLoadMoreVisible('evidenceLoadMore', evidenceHasMore);
  });
}

function buildEvidenceCard(item) {
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
  return card;
}

async function loadMoreEvidence() {
  if (!evidenceHasMore || evidenceLoadingMore || !evidenceCursor) return;
  evidenceLoadingMore = true;
  const btn = document.getElementById('evidenceLoadMore');
  if (btn) btn.textContent = 'Loading…';

  try {
    const q = query(
      collection(db, 'group_evidence'),
      where('groupId', '==', currentGroupId),
      orderBy('createdAt', 'desc'),
      startAfter(evidenceCursor),
      limit(EVIDENCE_PAGE)
    );
    const snap = await getDocs(q);
    const container = document.getElementById('evidenceList');
    if (!container) return;

    snap.docs.forEach((docSnap) => {
      container.appendChild(buildEvidenceCard(docSnap.data()));
    });

    if (snap.docs.length > 0) {
      evidenceCursor = snap.docs[snap.docs.length - 1];
    }
    evidenceHasMore = snap.docs.length >= EVIDENCE_PAGE;
    setLoadMoreVisible('evidenceLoadMore', evidenceHasMore);
  } catch (err) {
    console.error(err);
    showToast('Could not load more evidence', 'error');
  } finally {
    evidenceLoadingMore = false;
    if (btn && evidenceHasMore) btn.textContent = 'Load more evidence';
  }
}

// ====================== MODAL HELPERS ======================

function wireModalChrome(modalId, closeBtnId) {
  const modal = document.getElementById(modalId);
  const closeBtn = document.getElementById(closeBtnId);
  if (!modal) return;

  closeBtn?.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
}

function openAttestationModal() {
  const modal = document.getElementById('attestationModal');
  if (!modal) return;
  const input = document.getElementById('attestationStatementInput');
  const count = document.getElementById('attestationCharCount');
  if (input) input.value = '';
  if (count) count.textContent = '0 / 1000';
  modal.classList.remove('hidden');
  input?.focus();
}

async function submitAttestationFromModal() {
  if (!auth.currentUser) {
    showToast('Please sign in', 'error');
    return;
  }
  const uid = auth.currentUser.uid;
  const isMember =
    currentGroupData?.members?.includes(uid) || currentGroupData?.creatorId === uid;
  if (!isMember) {
    showToast('Join the group before signing an attestation', 'error');
    return;
  }

  const input = document.getElementById('attestationStatementInput');
  const statement = (input?.value || '').trim();
  if (!statement) {
    showToast('Write a statement first', 'error');
    return;
  }

  const btn = document.getElementById('confirmAttestationBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Signing…';
  }

  try {
    try {
      assertRateLimit('group_attestation', RL.group_attestation);
    } catch (e) {
      showToast(e.message || 'Slow down', 'warning');
      return;
    }

    await addDoc(collection(db, 'group_attestations'), {
      groupId: currentGroupId,
      statement: statement.slice(0, 1000),
      signedBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });
    showToast('Attestation signed', 'success');
    document.getElementById('attestationModal')?.classList.add('hidden');
    if (input) input.value = '';
  } catch (err) {
    console.error(err);
    showToast(err?.message || 'Failed to sign attestation', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Sign Attestation';
    }
  }
}

function openTimelineModal() {
  const modal = document.getElementById('timelineModal');
  if (!modal) return;
  const desc = document.getElementById('timelineDescriptionInput');
  const time = document.getElementById('timelineEventTimeInput');
  if (desc) desc.value = '';
  if (time) time.value = '';
  modal.classList.remove('hidden');
  desc?.focus();
}

async function submitTimelineFromModal() {
  if (!auth.currentUser) {
    showToast('Please sign in', 'error');
    return;
  }
  const uid = auth.currentUser.uid;
  const isMember =
    currentGroupData?.members?.includes(uid) || currentGroupData?.creatorId === uid;
  if (!isMember) {
    showToast('Join the group before adding timeline events', 'error');
    return;
  }

  const descEl = document.getElementById('timelineDescriptionInput');
  const timeEl = document.getElementById('timelineEventTimeInput');
  const description = (descEl?.value || '').trim();
  if (!description) {
    showToast('Describe the event first', 'error');
    return;
  }

  const btn = document.getElementById('confirmTimelineBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Adding…';
  }

  try {
    try {
      assertRateLimit('group_timeline', RL.group_timeline);
    } catch (e) {
      showToast(e.message || 'Slow down', 'warning');
      return;
    }

    let eventTime = serverTimestamp();
    if (timeEl?.value) {
      const d = new Date(timeEl.value);
      if (!Number.isNaN(d.getTime())) eventTime = d;
    }

    await addDoc(collection(db, 'group_timeline'), {
      groupId: currentGroupId,
      description: description.slice(0, 500),
      eventTime,
      addedBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
    });
    showToast('Timeline node added', 'success');
    document.getElementById('timelineModal')?.classList.add('hidden');
    if (descEl) descEl.value = '';
    if (timeEl) timeEl.value = '';
  } catch (err) {
    console.error(err);
    showToast(err?.message || 'Failed to add timeline node', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Add to Timeline';
    }
  }
}

function openEvidenceModal() {
  const modal = document.getElementById('evidenceModal');
  if (!modal) return;
  window.__pendingEvidenceFile = null;
  const nameEl = document.getElementById('evidenceFileName');
  const btn = document.getElementById('confirmEvidenceBtn');
  const input = document.getElementById('evidenceFileInput');
  if (nameEl) nameEl.textContent = '';
  if (btn) btn.disabled = true;
  if (input) input.value = '';
  modal.classList.remove('hidden');
}

/**
 * Modal deposit:
 * 1) Validate member
 * 2) Upload first (may scrub/compress images)
 * 3) Hash the bytes that were actually stored when possible
 *    — for raw/docs: hash original (same as uploaded)
 *    — for images: prefer hashing after pipeline; until upload.js returns blob,
 *      store hash of original and flag transform risk in status
 */
async function submitEvidenceFromModal() {
  if (!auth.currentUser) {
    showToast('Please sign in to deposit evidence', 'error');
    return;
  }

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

  const file = window.__pendingEvidenceFile;
  if (!file) {
    showToast('Choose a file first', 'error');
    return;
  }

  if (file.size > MAX_EVIDENCE_BYTES) {
    showToast('File too large (max 80 MB)', 'error');
    return;
  }
  if (!ALLOWED_EVIDENCE_EXT.test(file.name || '')) {
    showToast('File type not allowed for group evidence', 'error');
    return;
  }

  const btn = document.getElementById('confirmEvidenceBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Sealing…';
  }

  try {
    assertRateLimit('group_evidence', RL.group_evidence);
  } catch (e) {
    showToast(e.message || 'Slow down', 'warning');
    if (btn) {
      btn.disabled = false;
      btn.textContent = '🛡️ Seal & Deposit';
    }
    return;
  }

  try {
    showToast('Hashing evidence on your device…', 'info');
    // Hash original (always). Note: images may be transformed on upload.
    const hashOriginal = await computeSHA256(file);
    if (!hashOriginal || hashOriginal.length !== 64) {
      throw new Error('Failed to compute SHA-256 hash');
    }

    showToast('Uploading sealed file…', 'info');
    const folderPath = `group-evidence/${currentGroupId}`;
    const publicUrl = await uploadMedia(file, folderPath);

    const isImage =
      (file.type || '').startsWith('image/') ||
      /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name || '');
    const isRawDoc =
      /\.(pdf|txt|zip|doc|docx)$/i.test(file.name || '') ||
      (file.type || '').startsWith('application/') ||
      file.type === 'text/plain';

    // For docs/audio/video we treat original hash as stored hash.
    // For images, mark that privacy pipeline may alter bytes (honest status).
    const hashHex = hashOriginal;
    const status = isImage
      ? 'Sealed (SHA-256 of capture; image may be scrubbed/compressed on upload)'
      : isRawDoc
        ? 'Sealed (SHA-256 + document)'
        : 'Sealed (SHA-256 + media)';

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
      status,
      createdAt: serverTimestamp(),
    });

    showToast('Evidence deposited & sealed', 'success');
    document.getElementById('evidenceModal')?.classList.add('hidden');
    window.__pendingEvidenceFile = null;
  } catch (err) {
    console.error(err);
    showToast(err?.message || 'Failed to deposit evidence', 'error');
  } finally {
    if (btn) {
      btn.disabled = !window.__pendingEvidenceFile;
      btn.textContent = '🛡️ Seal & Deposit';
    }
  }
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
      
        try {
      assertRateLimit('group_evidence', RL.group_evidence);
    } catch (e) {
      showToast(e.message || 'Slow down', 'warning');
      return;
    }

      // 1. Client-side SHA-256 of the original bytes (before any transform)
      const hashHex = await computeSHA256(file);
      if (!hashHex || hashHex.length !== 64) {
        throw new Error('Failed to compute SHA-256 hash');
      }

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
        status: 'Sealed (SHA-256 + media)',
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
  assertRateLimit('group_attestation', RL.group_attestation);

  unsubscribeAttestations = onSnapshot(q, async (snapshot) => {
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

    const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const profiles = await getPublicProfiles(docs.map((d) => d.signedBy));

    docs.forEach((item) => {
      const profile = profiles[item.signedBy] || { displayName: (item.signedBy || '').substring(0, 8) + '…', photoURL: null };
      const chip = profileChipHtml(profile, escapeHtml);
      
      const card = document.createElement('div');
      card.className = 'glass p-4 rounded-2xl';

      card.innerHTML = `
        <p class="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">${escapeHtml(item.statement)}</p>
        <div class="mt-3 flex justify-between items-center text-[11px] text-zinc-500 gap-2">
          <span>${item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : ''}</span>
          <div class="flex items-center gap-2 min-w-0">
            <div class="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-zinc-700 text-[10px]">
              ${chip.avatarInner}
            </div>
            <span class="truncate font-medium text-zinc-400">${chip.name}</span>
          </div>
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

function ensureLoadMoreBtn({ id, parent, label, onClick }) {
  if (!parent) return;
  let btn = document.getElementById(id);
  if (!btn) {
    btn = document.createElement('button');
    btn.id = id;
    btn.type = 'button';
    btn.className =
      'mt-4 w-full rounded-2xl border border-zinc-700 bg-zinc-900/80 py-3 text-sm text-zinc-300 hover:bg-zinc-800 transition';
    btn.textContent = label;
    btn.addEventListener('click', onClick);
    parent.appendChild(btn);
  }
}

function setLoadMoreVisible(id, visible) {
  const btn = document.getElementById(id);
  if (!btn) return;
  btn.classList.toggle('hidden', !visible);
}

function removeLoadMoreBtn(id) {
  document.getElementById(id)?.remove();
}
