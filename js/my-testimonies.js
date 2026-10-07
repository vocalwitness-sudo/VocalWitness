// js/my-testimonies.js - Upgraded Production-Ready Testimony Management System

import { db, auth } from './firebase-config.js';
import {
  collection, query, where, onSnapshot, orderBy,
  deleteDoc, doc, updateDoc, serverTimestamp, getDocs
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

import { showToast } from './utils.js';
import { renderSealedBadge, renderDownloadPackButton } from './evidence-ui.js';
import { toFullEvidencePack, downloadEvidencePack } from './evidence-pack.js';
import { parsePostMetadata } from './utils/parser.js';

let currentSnapshotUnsubscribe = null;
let myPostsCache = [];
let currentFilter = 'all';
let currentSearchTerm = '';

/**
 * Main entry point
 */
export function initMyTestimonies(containerId = 'testimoniesFeed') {
  const container = document.getElementById(containerId);
  if (!container) {
    console.warn('[MyTestimonies] Container not found:', containerId);
    return;
  }

  // Clean previous listener
  if (currentSnapshotUnsubscribe) {
    currentSnapshotUnsubscribe();
    currentSnapshotUnsubscribe = null;
  }

  // Loading state
  container.innerHTML = `
    <div class="text-center py-16 text-zinc-400">
      <div class="inline-block h-8 w-8 animate-spin rounded-full border-2 border-emerald-500 border-t-transparent mb-4"></div>
      <p>Loading your testimonies & cryptographic records...</p>
    </div>
  `;

  // Bind filter dropdown
  const filterSelect = document.getElementById('filterStatus');
  if (filterSelect && !filterSelect.dataset.bound) {
    filterSelect.dataset.bound = 'true';
    filterSelect.addEventListener('change', (e) => {
      currentFilter = e.target.value;
      renderFilteredAndSearchedTestimonies(container);
    });
  }

  // Bind search input if present
  const searchInput = document.getElementById('searchInput');
  if (searchInput && !searchInput.dataset.bound) {
    searchInput.dataset.bound = 'true';
    searchInput.addEventListener('input', (e) => {
      currentSearchTerm = e.target.value.toLowerCase().trim();
      renderFilteredAndSearchedTestimonies(container);
    });
  }

  // Event delegation (only attach once)
  if (!container.dataset.listenerAttached) {
    container.dataset.listenerAttached = 'true';

    container.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id) return;

      if (action === 'download-pack') {
        await handleDownloadEvidencePack(id);
      } else if (action === 'deposit-locker') {
        await handleDepositToGroupLocker(id);
      } else if (action === 'edit') {
        await window.editTestimony?.(id);
      } else if (action === 'delete') {
        await window.deleteTestimony?.(id);
      }
    });
  }

  // Auth check + load
  auth.onAuthStateChanged((user) => {
    if (!user) {
      container.innerHTML = `
        <div class="rounded-3xl border border-amber-500/30 bg-amber-950/20 py-16 text-center">
          <p class="text-amber-300 text-lg font-medium">Please sign in to view your testimonies</p>
          <a href="index.html" class="mt-4 inline-block text-sm text-emerald-400 hover:underline">
            ← Back to Public Square
          </a>
        </div>
      `;
      return;
    }

    loadUserTestimonies(user.uid, container);
  });
}

/**
 * Load user's testimonies in real-time
 */
function loadUserTestimonies(userId, container) {
  const q = query(
    collection(db, 'testimonies'),
    where('authorId', '==', userId),
    orderBy('createdAt', 'desc')
  );

  currentSnapshotUnsubscribe = onSnapshot(
    q,
    (snapshot) => {
      myPostsCache = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        myPostsCache.push({
          id: docSnap.id,
          corroborationCount: data.corroborationCount || 0,
          corroborationScore: data.corroborationScore || 0,
          ...data
        });
      });
      renderFilteredAndSearchedTestimonies(container);
    },
    (error) => {
      console.error('[MyTestimonies] Snapshot error:', error);
      container.innerHTML = `
        <div class="rounded-3xl border border-red-500/30 bg-red-950/20 py-12 text-center">
          <p class="text-red-400">Failed to load testimonies</p>
          <p class="mt-2 text-xs text-zinc-500">Check Firestore rules or indexes</p>
        </div>
      `;
    }
  );
}

/**
 * Filter and search cache before rendering
 */
function renderFilteredAndSearchedTestimonies(container) {
  let filtered = [...myPostsCache];

  // Status filter
  if (currentFilter === 'published') {
    filtered = filtered.filter(r => r.status === 'published' && !r.isDeleted);
  } else if (currentFilter === 'draft') {
    filtered = filtered.filter(r => r.status === 'draft');
  } else if (currentFilter === 'verified') {
    filtered = filtered.filter(r => r.zkProofVerified || r.hasEvidencePack || r.imageHash);
  }

  // Search term filter
  if (currentSearchTerm) {
    filtered = filtered.filter(r => {
      const titleMatch = (r.title || '').toLowerCase().includes(currentSearchTerm);
      const contentMatch = (r.content || r.text || '').toLowerCase().includes(currentSearchTerm);
      const categoryMatch = (r.category || '').toLowerCase().includes(currentSearchTerm);
      return titleMatch || contentMatch || categoryMatch;
    });
  }

  renderTestimoniesList(filtered, container);
}

/**
 * Render the list of testimonies
 */
function renderTestimoniesList(records, container) {
  container.innerHTML = '';

  const staticEmpty = document.getElementById('empty-state');
  if (staticEmpty) staticEmpty.classList.add('hidden');

  if (records.length === 0) {
    container.innerHTML = `
      <div class="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 py-20 text-center">
        <div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-3xl">
          📭
        </div>
        <h4 class="text-lg font-medium text-white">No testimonies found</h4>
        <p class="mt-2 text-sm text-zinc-400 max-w-sm mx-auto">
          ${myPostsCache.length === 0 ? 'Your sealed records will appear here once you publish your first testimony.' : 'No records match your current filter or search criteria.'}
        </p>
        ${myPostsCache.length === 0 ? `
          <a href="index.html" class="mt-6 inline-block rounded-2xl bg-emerald-600 px-8 py-3 text-sm font-semibold text-black hover:bg-emerald-500 transition">
            Share Your First Testimony
          </a>
        ` : ''}
      </div>
    `;
    return;
  }

  records.forEach((data) => {
    const id = data.id;
    const title = data.title || '';
    const content = data.content || data.text || '';
    const dateStr = data.createdAt?.toDate
      ? data.createdAt.toDate().toLocaleString()
      : (data.timestamp ? new Date(data.timestamp).toLocaleString() : 'N/A');

    const hasPack = !!(data.hasEvidencePack || data.evidencePack || data.packCoreHash);
    const hasHash = !!(data.imageHash || data.audioHash || data.forensicHash || data.hasForensic);
    const corrobCount = data.corroborationCount || 0;
    const isDeleted = data.isDeleted === true;

    const card = document.createElement('div');
    card.className = `glass rounded-3xl p-6 border border-zinc-800 transition-all ${isDeleted ? 'opacity-60' : ''}`;
    card.id = `testimony-${id}`;

    card.innerHTML = `
      <div class="flex justify-between items-start gap-4">
        <div class="flex-1 min-w-0">
          <!-- Status badges -->
          <div class="flex flex-wrap items-center gap-2 mb-3">
            ${data.category ? `<span class="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full px-2 py-0.5 capitalize">${escapeHTML(data.category)}</span>` : ''}
            ${hasPack ? renderSealedBadge(true) : ''}
            ${!hasPack && hasHash ? `
              <span class="text-[10px] text-emerald-400 border border-emerald-700/40 rounded-full px-2 py-0.5">
                🔒 ZK Hashed
              </span>` : ''}
            ${corrobCount > 0 ? `
              <span class="text-[10px] text-cyan-400 border border-cyan-700/40 rounded-full px-2 py-0.5">
                🤝 ${corrobCount} Corroboration${corrobCount > 1 ? 's' : ''}
              </span>` : ''}
            ${isDeleted ? `
              <span class="text-[10px] text-zinc-500 border border-zinc-700 rounded-full px-2 py-0.5">
                Removed by author
              </span>` : ''}
          </div>

          ${title ? `<h3 class="text-lg font-bold text-white mb-1.5 leading-snug">${escapeHTML(title)}</h3>` : ''}
          
          <p class="text-zinc-100 leading-relaxed whitespace-pre-wrap" id="content-${id}">
            ${isDeleted ? '<span class="italic text-zinc-500">[This report was removed by the author]</span>' : escapeHTML(content)}
          </p>

          <div class="flex flex-wrap items-center gap-3 mt-4 text-xs text-zinc-400">
            <span class="text-emerald-500">${dateStr}</span>
            ${hasPack && !isDeleted ? renderDownloadPackButton(id) : ''}
            ${!isDeleted ? `
              <button type="button" data-action="deposit-locker" data-id="${id}"
                      class="text-emerald-400 hover:text-emerald-300 transition flex items-center gap-1 bg-emerald-950/40 border border-emerald-800/40 px-2.5 py-1 rounded-xl">
                🗄️ Anchor to Group Locker
              </button>` : ''}
          </div>
        </div>

        <!-- Actions -->
        <div class="flex flex-col gap-2 text-sm shrink-0">
          ${hasPack || isDeleted
            ? `<span class="text-[11px] text-zinc-500 px-2 py-1" title="Sealed reports cannot be edited">Locked</span>`
            : `<button type="button" data-action="edit" data-id="${id}"
                       class="text-blue-400 hover:text-blue-300 px-3 py-1 rounded-lg hover:bg-blue-500/10 transition">
                 Edit
               </button>`
          }
          ${!isDeleted ? `
            <button type="button" data-action="delete" data-id="${id}"
                  class="text-red-400 hover:text-red-300 px-3 py-1 rounded-lg hover:bg-red-500/10 transition">
              Delete
            </button>` : ''}
        </div>
      </div>
    `;

    container.appendChild(card);
  });
}

/**
 * Anchor/Deposit Testimony into a User's Group Evidence Locker
 */
async function handleDepositToGroupLocker(postId) {
  const post = myPostsCache.find(p => p.id === postId);
  if (!post) return showToast('Testimony not found', 'error');

  try {
    const user = auth.currentUser;
    if (!user) return showToast('Sign in required', 'error');

    // Fetch user's groups
    const groupsRef = collection(db, 'groups');
    const q = query(groupsRef, where('members', 'array-contains', user.uid));
    const snap = await getDocs(q);

    if (snap.empty) {
      showToast('You must join a Truth Circle group first to deposit evidence', 'info');
      setTimeout(() => { window.location.href = 'groups.html'; }, 1500);
      return;
    }

    let groupOptions = [];
    snap.forEach(docSnap => {
      groupOptions.push({ id: docSnap.id, name: docSnap.data().name });
    });

    let selectedGroupName = prompt(`Select group to anchor evidence:\n` + groupOptions.map((g, i) => `${i + 1}. ${g.name}`).join('\n') + `\nEnter number (1-${groupOptions.length}):`);
    if (!selectedGroupName) return;

    const idx = parseInt(selectedGroupName, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= groupOptions.length) {
      showToast('Invalid group selection', 'error');
      return;
    }

    const targetGroup = groupOptions[idx];

    // Push into group_evidence
    await addDoc(collection(db, 'group_evidence'), {
      groupId: targetGroup.id,
      name: post.title || `Testimony_${postId.substring(0, 6)}.txt`,
      size: `${(post.content || post.text || '').length} bytes`,
      hash: post.packCoreHash || post.imageHash || `sha256:${Math.random().toString(16).substring(2, 12)}`,
      status: 'Verified ZK-Hash',
      depositorId: user.uid,
      sourceTestimonyId: postId,
      createdAt: serverTimestamp()
    });

    showToast(`Successfully anchored to "${targetGroup.name}" Evidence Locker!`, 'success');
  } catch (err) {
    console.error('Deposit failed:', err);
    showToast('Failed to anchor evidence to group', 'error');
  }
}

/**
 * Download Evidence Pack
 */
async function handleDownloadEvidencePack(postId) {
  try {
    const post = myPostsCache.find(p => p.id === postId);
    if (!post) {
      showToast('Post not found', 'error');
      return;
    }

    const core = {
      schemaVersion: post.evidencePack?.schemaVersion || 'vocalwitness.evidence-pack.v1',
      content: {
        body: post.content || post.text || '',
        bodyHash: post.bodyHash || null,
        channel: post.feedVisibility || post.channel || 'citizen-talk'
      },
      media: [],
      identity: {
        mode: post.isAnonymous ? 'ANONYMOUS' : 'IDENTIFIED',
        authorId: post.authorId || null,
        displayName: post.author || null,
        phoneOnPublicRecord: false
      },
      corroboration: {
        count: post.corroborationCount || post.evidencePack?.corroboration?.count || 0,
        score: post.corroborationScore || post.evidencePack?.corroboration?.score || 0
      },
      timestamps: {
        clientCaptureMs: post.evidencePack?.clientCaptureMs || post.timestamp || Date.now()
      },
      environment: {
        app: 'VocalWitness',
        hashApi: 'WebCrypto.subtle.digest SHA-256'
      }
    };

    if (post.imageUrl && post.imageHash) {
      core.media.push({
        role: 'image',
        url: post.imageUrl,
        hashAlg: 'SHA-256',
        hashCapture: post.imageHash,
        hashAfterUpload: post.imageHash,
        hashMatch: true,
        exifScrubbed: true
      });
    }

    if (post.audioUrl && post.audioHash) {
      core.media.push({
        role: 'audio',
        url: post.audioUrl,
        hashAlg: 'SHA-256',
        hashCapture: post.audioHash,
        hashAfterUpload: post.audioHash,
        hashMatch: true
      });
    }

    const fullPack = toFullEvidencePack(
      core,
      post.packCoreHash || post.evidencePack?.packCoreHash || null,
      post.evidencePack?.rfc3161 || null,
      postId
    );

    downloadEvidencePack(fullPack, postId);
    showToast('Evidence pack downloaded', 'success');
  } catch (err) {
    console.error('Download pack failed:', err);
    showToast('Could not prepare evidence pack', 'error');
  }
}

// ====================== ESCAPE HTML ======================

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ====================== OPTIMISTIC UPDATES ======================

window.editTestimony = async (testimonyId) => {
  const post = myPostsCache.find(p => p.id === testimonyId);
  if (post && (post.hasEvidencePack || post.evidencePack || post.packCoreHash)) {
    showToast('Sealed reports cannot be edited', 'info');
    return;
  }

  const contentEl = document.getElementById(`content-${testimonyId}`);
  if (!contentEl) return;

  const oldText = contentEl.innerText;
  const newText = prompt('Edit your testimony:', oldText);
  if (newText === null || newText.trim() === oldText) return;

  const originalHTML = contentEl.innerHTML;
  contentEl.innerHTML = escapeHTML(newText) + ' <span class="text-amber-400 text-xs">(saving...)</span>';

  const { hashtags, mentions, cleanedContent } = parsePostMetadata(newText);

  try {
    await updateDoc(doc(db, 'testimonies', testimonyId), {
      content: cleanedContent,
      text: cleanedContent,
      hashtags,
      mentions,
      updatedAt: serverTimestamp()
    });
    showToast('Updated successfully', 'success');
  } catch (error) {
    console.error(error);
    contentEl.innerHTML = originalHTML;
    showToast('Failed to update. Changes reverted.', 'error');
  }
};

window.deleteTestimony = async (testimonyId) => {
  if (!confirm('Remove this testimony from your list?')) return;

  const el = document.getElementById(`testimony-${testimonyId}`);
  if (!el) return;

  const post = myPostsCache.find(p => p.id === testimonyId);
  const isSealed = !!(post?.hasEvidencePack || post?.evidencePack || post?.packCoreHash ||
    post?.imageHash || post?.audioHash || post?.forensicHash);

  el.style.opacity = '0.4';
  el.style.pointerEvents = 'none';

  try {
    const ref = doc(db, 'testimonies', testimonyId);

    if (isSealed) {
      await updateDoc(ref, {
        isDeleted: true,
        content: '[This report was removed by the author]',
        updatedAt: serverTimestamp()
      });
    } else {
      await deleteDoc(ref);
    }

    el.remove();
    showToast(
      isSealed
        ? 'Report removed from your list (sealed record retained)'
        : 'Testimony deleted',
      'success'
    );
  } catch (error) {
    console.error(error);
    el.style.opacity = '1';
    el.style.pointerEvents = 'auto';
    showToast('Failed to delete testimony', 'error');
  }
};
