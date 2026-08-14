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

    try {
        // Visual feedback (Optimistic UI update)
        if (btnEl) {
            btnEl.classList.toggle('active-reaction');
        }

        // Perform atomic update in Firestore
        await updateDoc(postRef, {
            [`reactions.${type}`]: increment(1),
            [`reactedUsers.${type}`]: arrayUnion(userUid)
        });

    } catch (error) {
        console.error(`Error processing reaction (${type}):`, error);
        
        // Revert visual state on failure
        if (btnEl) {
            btnEl.classList.toggle('active-reaction');
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
        const postId = btn.getAttribute('data-post-id') || btn.closest('[data-post-id]')?.getAttribute('data-post-id');
        const reactionType = btn.getAttribute('data-type') || 'like';

        if (postId) {
            handleReaction(postId, reactionType, btn);
        }
    });
}

// Window exports for global fallback
window.handleReaction = handleReaction;
window.bindReactionEvents = bindReactionEvents;
