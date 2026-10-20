// js/reactions.js - Subcollection reactions (Batch 2.3)
// Client writes testimonies/{id}/reactions/{uid} only.
// Parent counters are updated by Cloud Function onTestimonyReactionWrite.

import { db, auth } from './firebase-config.js';
import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { showToast } from './utils.js';
import { requireAuth } from './auth.js';

const ALLOWED = new Set(['respect', 'truth', 'solidarity', 'impact']);

/** Map legacy UI labels → rules-allowed types */
function normalizeType(type) {
  const t = String(type || 'respect').toLowerCase();
  const map = {
    respect: 'respect',
    truth: 'truth',
    solidarity: 'solidarity',
    impact: 'impact',
    like: 'respect',
    concern: 'truth',
    endorse: 'solidarity',
    flag: 'impact',
  };
  return map[t] || (ALLOWED.has(t) ? t : 'respect');
}

/**
 * Toggle reaction for current user on a testimony.
 * @param {string} postId
 * @param {string} type
 * @param {HTMLElement|null} btnEl
 */
export async function handleReaction(postId, type = 'respect', btnEl = null) {
  if (!requireAuth('Please sign in to react to posts.')) return;

  const user = auth.currentUser;
  if (!user || !postId) return;

  const reactionType = normalizeType(type);
  const reactionRef = doc(db, 'testimonies', postId, 'reactions', user.uid);

  // Prefer server state over DOM class when possible
  let existing = null;
  try {
    const snap = await getDoc(reactionRef);
    existing = snap.exists() ? snap.data() : null;
  } catch (e) {
    console.warn('[reactions] could not read existing reaction', e);
  }

  const sameTypeActive = existing?.type === reactionType;
  // If DOM says active but type differs, treat as switch
  const isRemoving = sameTypeActive;

  // Optimistic UI
  if (btnEl) {
    btnEl.classList.toggle('active-reaction', !isRemoving);
    const countSpan = btnEl.querySelector('span');
    if (countSpan) {
      const current = parseInt(countSpan.textContent || '0', 10);
      countSpan.textContent = String(
        Math.max(0, isRemoving ? current - 1 : current + 1)
      );
    }
  }

  try {
    if (isRemoving) {
      await deleteDoc(reactionRef);
    } else if (existing) {
      // Switch type (e.g. respect → truth) — Function applies deltas
      await setDoc(
        reactionRef,
        {
          type: reactionType,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      // Create — rules require only type + createdAt
      await setDoc(reactionRef, {
        type: reactionType,
        createdAt: serverTimestamp(),
      });
    }
  } catch (error) {
    console.error(`[reactions] ${reactionType} failed:`, error);

    // Rollback optimistic UI
    if (btnEl) {
      btnEl.classList.toggle('active-reaction', isRemoving);
      const countSpan = btnEl.querySelector('span');
      if (countSpan) {
        const current = parseInt(countSpan.textContent || '0', 10);
        countSpan.textContent = String(
          Math.max(0, isRemoving ? current + 1 : current - 1)
        );
      }
    }

    const code = error?.code || '';
    if (code === 'permission-denied') {
      showToast('Reaction blocked by security rules.', 'error');
    } else {
      showToast('Unable to update reaction. Please try again.', 'error');
    }
  }
}

export { handleReaction as toggleReaction };

/**
 * Mark reaction buttons active from existing subcollection docs (optional feed helper).
 * Call after rendering a post card if you load user reaction.
 */
export async function syncReactionButtonState(postId, containerEl) {
  const user = auth.currentUser;
  if (!user || !postId || !containerEl) return;

  try {
    const snap = await getDoc(doc(db, 'testimonies', postId, 'reactions', user.uid));
    const type = snap.exists() ? snap.data()?.type : null;
    containerEl.querySelectorAll('[data-action="react"], .reaction-btn').forEach((btn) => {
      const t = normalizeType(
        btn.getAttribute('data-reaction') || btn.getAttribute('data-type') || 'respect'
      );
      btn.classList.toggle('active-reaction', type === t);
    });
  } catch (_) {}
}

export function bindReactionEvents() {
  if (window.__reactionDelegationBound) return;
  window.__reactionDelegationBound = true;

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action="react"], .reaction-btn');
    if (!btn) return;

    e.preventDefault();
    const postId =
      btn.getAttribute('data-id') ||
      btn.getAttribute('data-post-id') ||
      btn.closest('[data-post-id]')?.getAttribute('data-post-id');
    const reactionType =
      btn.getAttribute('data-reaction') ||
      btn.getAttribute('data-type') ||
      'respect';

    if (postId) {
      handleReaction(postId, reactionType, btn);
    }
  });
}

window.handleReaction = handleReaction;
window.toggleReaction = handleReaction;
window.bindReactionEvents = bindReactionEvents;
window.syncReactionButtonState = syncReactionButtonState;
