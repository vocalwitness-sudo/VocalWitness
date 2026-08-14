// js/reactions.js - Reaction Handler for Citizen Talk & Witness Voice
import { db, auth } from './firebase-config.js';
import { doc, updateDoc, arrayUnion, arrayRemove, increment } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { requireAuth } from './auth.js';

/**
 * Handles toggling post reactions (likes, witness endorsements, flags, etc.)
 * @param {string} postId - Firestore document ID
 * @param {string} type - Reaction type ('respect', 'truth', 'concern', 'impact', 'like', etc.)
 * @param {HTMLElement} [btnEl] - Optional DOM element for instant UI feedback
 */
export async function handleReaction(postId, type = 'respect', btnEl = null) {
    if (!requireAuth("Please sign in to react to posts.")) return;

    const user = auth.currentUser;
    if (!user || !postId) return;

    const postRef = doc(db, "testimonies", postId);
    const userUid = user.uid;

    // Check active state directly from DOM class or dataset
    const isCurrentlyActive = btnEl ? btnEl.classList.contains('active-reaction') : false;
    const isRemoving = isCurrentlyActive;

    // 1. Optimistic UI Update
    if (btnEl) {
        btnEl.classList.toggle('active-reaction', !isRemoving);
        
        const countSpan = btnEl.querySelector('span');
        if (countSpan) {
            const currentCount = parseInt(countSpan.textContent || '0', 10);
            countSpan.textContent = Math.max(0, isRemoving ? currentCount - 1 : currentCount + 1);
        }
    }

    try {
        // 2. Perform Atomic Update in Firestore
        await updateDoc(postRef, {
            [`reactions.${type}`]: increment(isRemoving ? -1 : 1),
            [`reactedUsers.${type}`]: isRemoving ? arrayRemove(userUid) : arrayUnion(userUid)
        });

    } catch (error) {
        console.error(`Error processing reaction (${type}):`, error);

        // 3. Rollback UI state on failure
        if (btnEl) {
            btnEl.classList.toggle('active-reaction', isRemoving);
            
            const countSpan = btnEl.querySelector('span');
            if (countSpan) {
                const currentCount = parseInt(countSpan.textContent || '0', 10);
                countSpan.textContent = Math.max(0, isRemoving ? currentCount + 1 : currentCount - 1);
            }
        }
        showToast("Unable to update reaction. Please try again.", "error");
    }
}

// Alias export for backward compatibility
export { handleReaction as toggleReaction };

/**
 * Binds global event listener for reaction button clicks across feeds
 */
export function bindReactionEvents() {
    if (window.__reactionDelegationBound) return;
    window.__reactionDelegationBound = true;

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="react"], .reaction-btn');
        if (!btn) return;

        e.preventDefault();
        const postId = btn.getAttribute('data-id') || btn.getAttribute('data-post-id') || btn.closest('[data-post-id]')?.getAttribute('data-post-id');
        const reactionType = btn.getAttribute('data-reaction') || btn.getAttribute('data-type') || 'respect';

        if (postId) {
            handleReaction(postId, reactionType, btn);
        }
    });
}

// Window exports for global fallback
window.handleReaction = handleReaction;
window.toggleReaction = handleReaction;
window.bindReactionEvents = bindReactionEvents;
