// js/reactions.js - Reaction Handler for Citizen Talk & Witness Voice
import { db, auth } from './firebase-config.js';
import { doc, updateDoc, arrayUnion, arrayRemove, increment } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { requireAuth } from './auth.js';

/**
 * Handles toggling post reactions (likes, witness endorsements, flags)
 * @param {string} postId - Firestore document ID
 * @param {string} type - Reaction type ('like', 'endorse', 'flag')
 * @param {HTMLElement} [btnEl] - Optional DOM element for instant UI feedback
 */
export async function handleReaction(postId, type = 'like', btnEl = null) {
    if (!requireAuth("Please sign in to react to posts.")) return;

    const user = auth.currentUser;
    if (!user || !postId) return;

    const postRef = doc(db, "posts", postId);
    const userUid = user.uid;

    // Check current state from DOM attribute or CSS class
    const isCurrentlyActive = btnEl ? btnEl.classList.contains('active-reaction') : false;
    const isRemoving = isCurrentlyActive;

    // Optimistic UI update
    if (btnEl) {
        btnEl.classList.toggle('active-reaction', !isRemoving);
        
        // Update count badge inside button if present
        const countSpan = btnEl.querySelector('.reaction-count');
        if (countSpan) {
            const currentCount = parseInt(countSpan.textContent || '0', 10);
            countSpan.textContent = Math.max(0, isRemoving ? currentCount - 1 : currentCount + 1);
        }
    }

    try {
        // Atomic update: toggle add vs remove based on state
        await updateDoc(postRef, {
            [`reactions.${type}`]: increment(isRemoving ? -1 : 1),
            [`reactedUsers.${type}`]: isRemoving ? arrayRemove(userUid) : arrayUnion(userUid)
        });

    } catch (error) {
        console.error(`Error processing reaction (${type}):`, error);

        // Rollback visual state on error
        if (btnEl) {
            btnEl.classList.toggle('active-reaction', isRemoving);
            
            const countSpan = btnEl.querySelector('.reaction-count');
            if (countSpan) {
                const currentCount = parseInt(countSpan.textContent || '0', 10);
                countSpan.textContent = Math.max(0, isRemoving ? currentCount + 1 : currentCount - 1);
            }
        }
        showToast("Unable to update reaction. Please try again.", "error");
    }
}

/**
 * Binds global event listener for reaction button clicks in feeds
 */
export function bindReactionEvents() {
    if (window.__reactionDelegationBound) return;
    window.__reactionDelegationBound = true;

    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action="react"], .reaction-btn');
        if (!btn) return;

        e.preventDefault();
        
        // Extract parameters safely
        const postId = btn.getAttribute('data-post-id') || btn.closest('[data-post-id]')?.getAttribute('data-post-id');
        const reactionType = btn.getAttribute('data-type') || btn.getAttribute('data-reaction') || 'like';

        if (postId) {
            handleReaction(postId, reactionType, btn);
        }
    });
}

// Window exports for global fallback / inline execution
window.handleReaction = handleReaction;
window.bindReactionEvents = bindReactionEvents;
