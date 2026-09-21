/**
 * js/evidence-ui.js
 * UI utilities for Evidence Pack rendering & interaction
 * Name = Reality version
 */

import {
  buildFullPackFromTestimony,
  downloadEvidencePack,
  shareTestimony,
  exportForNewsroom,
  buildShareUrl,
} from './evidence-pack.js';
import { showSupportWitnessModal } from './support-witness.js';
import { showToast } from './utils.js';

/**
 * Small sealed badge
 */
export function renderSealedBadge(hasPack) {
  if (!hasPack) return '';
  return `
    <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/60 border border-emerald-700/50 px-2.5 py-0.5 text-[10px] font-medium text-emerald-400 shadow-sm"
          title="Cryptographically sealed. Verifies integrity of the record, not real-world truth.">
      <span class="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
      🛡️ Sealed • Verifiable
    </span>
  `;
}

/**
 * Simple download button
 */
export function renderDownloadPackButton(testimonyId) {
  if (!testimonyId) return '';
  return `
    <button type="button"
            data-action="download-pack"
            data-id="${testimonyId}"
            class="download-evidence-pack-btn inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition text-xs font-medium">
      📥 Download Pack
    </button>
  `;
}

/**
 * Full evidence toolbar
 */
export function renderEvidenceToolbar(testimonyId, authorId = '') {
  if (!testimonyId) return '';
  return `
    <div class="evidence-toolbar flex flex-wrap items-center gap-3 pt-2 text-[11px] border-t border-slate-800/60 mt-3">
      <button type="button"
              data-action="download-pack"
              data-id="${testimonyId}"
              class="download-evidence-pack-btn inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 transition font-medium">
        📥 Download Evidence Pack
      </button>
      <span class="text-slate-600">•</span>
      <button type="button"
              data-action="share-testimony"
              data-id="${testimonyId}"
              class="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition">
        🔗 Share Verifiable Link
      </button>
      <span class="text-slate-600">•</span>
      <button type="button"
              data-action="export-newsroom"
              data-id="${testimonyId}"
              class="inline-flex items-center gap-1 text-slate-400 hover:text-slate-200 transition">
        📰 Export for Newsroom
      </button>
      <span class="text-slate-600">•</span>
      <button type="button"
              data-action="support-witness"
              data-author-id="${authorId}"
              class="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 transition font-medium">
        ⭐ Support Witness
      </button>
    </div>
  `;
}

/**
 * Main action handler
 */
export async function handleEvidenceAction(e, post) {
  const btn = e.target.closest('[data-action]');
  if (!btn || !post) return false;

  const action = btn.dataset.action;

  try {
    btn.classList.add('opacity-50', 'pointer-events-none');

    switch (action) {
      case 'download-pack': {
        showToast('Generating cryptographic Evidence Pack…', 'info');

        // Correct way: build full pack from the testimony object
        const fullPack = await buildFullPackFromTestimony(post);

        downloadEvidencePack(fullPack, post.id || post.testimonyId || 'report');
        showToast('✅ Evidence Pack downloaded', 'success');
        return true;
      }

      case 'share-testimony': {
        const result = await shareTestimony(post);
        if (result.ok) {
          showToast(
            result.method === 'native' ? 'Shared' : '🔗 Verifiable link copied',
            'success'
          );
        } else if (result.method !== 'cancelled') {
          showToast('Could not share link', 'error');
        }
        return true;
      }

      case 'export-newsroom': {
        exportForNewsroom(post, {
          disputes: post.disputes || [],
          auditSnippet: post.auditSnippet || null,
        });
        showToast('✅ Newsroom packet exported', 'success');
        return true;
      }

      case 'copy-share-url': {
        const url = buildShareUrl(post);
        await navigator.clipboard.writeText(url);
        showToast('📋 Verifiable link copied', 'success');
        return true;
      }

      case 'support-witness': {
        const authorId = btn.dataset.authorId || post.uid || post.authorId;
        const authorName = post.author || post.displayName || 'Witness';

        if (!authorId) {
          showToast('Unable to identify witness', 'error');
          return true;
        }

        if (typeof showSupportWitnessModal === 'function') {
          showSupportWitnessModal(authorId, authorName);
        }
        return true;
      }

      default:
        return false;
    }
  } catch (error) {
    console.error(`[evidence-ui] Action failed (${action}):`, error);
    showToast('Failed to process evidence request', 'error');
    return false;
  } finally {
    btn.classList.remove('opacity-50', 'pointer-events-none');
  }
}

/**
 * Global fallback for buttons outside the main feed handler
 */
export function initEvidencePackUI() {
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest(
      '.download-evidence-pack-btn, [data-action="download-pack"]'
    );
    if (!btn || btn.dataset.handledByFeed) return;

    const id = btn.dataset.id || btn.dataset.testimonyId;
    if (!id) return;

    e.preventDefault();
    e.stopPropagation();

    try {
      // Try to recover the full post object
      let post = null;

      const card = btn.closest('[data-post-id], .post-card, .testimony-card, article');
      if (card && card.__postData) {
        post = card.__postData;
      } else if (window.__testimoniesCache?.[id]) {
        post = window.__testimoniesCache[id];
      }

      if (!post) {
        // Minimal fallback so the button still does something useful
        post = { id };
        showToast('Limited pack (full data not in memory)', 'info');
      }

      await handleEvidenceAction(
        { target: btn, preventDefault() {}, stopPropagation() {} },
        post
      );
    } catch (err) {
      console.error('[evidence-ui] Fallback failed:', err);
      showToast('Failed to generate Evidence Pack', 'error');
    }
  });
}
