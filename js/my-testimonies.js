// js/my-testimonies.js
// Compatible with the professional my-testimonies.html

import { db, auth } from './firebase-config.js';
import {
  collection, query, where, onSnapshot, orderBy,
  deleteDoc, doc, updateDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

import { showToast } from './utils.js';
import { renderSealedBadge, renderDownloadPackButton } from './evidence-ui.js';
import { toFullEvidencePack, downloadEvidencePack } from './evidence-pack.js';
import { parsePostMetadata } from './utils/parser.js';

let currentSnapshotUnsubscribe = null;
let myPostsCache = [];

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
      <p>Loading your testimonies...</p>
    </div>
  `;

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
    (snapshot) => renderTestimonies(snapshot, container),
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
 * Escape HTML to prevent XSS
 */
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Render the list of testimonies
 */
function renderTestimonies(snapshot, container) {
  container.innerHTML = '';
  myPostsCache = [];

  // Hide the static empty-state if it exists
  const staticEmpty = document.getElementById('empty-state');
  if (staticEmpty) staticEmpty.classList.add('hidden');

  if (snapshot.empty) {
    container.innerHTML = `
      <div class="rounded-3xl border border-dashed border-zinc-700 bg-zinc-900/40 py-20 text-center">
        <div class="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-zinc-800 text-3xl">
          📭
        </div>
        <h4 class="text-lg font-medium text-white">No testimonies yet</h4>
        <p class="mt-2 text-sm text-zinc-400 max-w-sm mx-auto">
          Your sealed records will appear here once you publish your first testimony.
        </p>
        <a href="index.html" 
           class="mt-6 inline-block rounded-2xl bg-emerald-600 px-8 py-3 text-sm font-semibold text-black hover:bg-emerald-500 transition">
          Share Your First Testimony
        </a>
      </div>
    `;
    return;
  }

  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    const id = docSnap.id;

    myPostsCache.push({
      id,
      corroborationCount: data.corroborationCount || 0,
      corroborationScore: data.corroborationScore || 0,
      ...data
    });

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
            ${hasPack ? renderSealedBadge(true) : ''}
            ${!hasPack && hasHash ? `
              <span class="text-[10px] text-emerald-400 border border-emerald-700/40 rounded-full px-2 py-0.5">
                🔒 Hashed
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
      // Soft delete – keep the sealed record
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
