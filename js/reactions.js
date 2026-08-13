// js/reactions.js - Atomic Reaction & Verification Engine
import { db, auth } from './firebase-config.js';
import { 
    doc, 
    runTransaction, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { logSecurityAudit } from './audit.js';

/**
 * Toggles a reaction (e.g., 'upvote', 'verify', 'flag') on a testimony.
 * Uses atomic transactions to update counts and track user state.
 * 
 * @param {string} testimonyId - Target testimony document ID
 * @param {string} reactionType - Type of reaction ('upvote' | 'verify' | 'flag')
 */
export async function toggleReaction(testimonyId, reactionType = 'upvote') {
    if (!auth.currentUser) {
        showToast('Please sign in to react to testimonies.', 'warning');
        return;
    }

    if (!testimonyId) {
        console.error('Invalid testimony ID passed to toggleReaction');
        return;
    }

    const userId = auth.currentUser.uid;
    const testimonyRef = doc(db, 'testimonies', testimonyId);
    const userReactionRef = doc(db, 'testimonies', testimonyId, 'reactions', userId);

    try {
        await runTransaction(db, async (transaction) => {
            const testimonyDoc = await transaction.get(testimonyRef);
            if (!testimonyDoc.exists()) {
                throw new Error('Testimony no longer exists.');
            }

            const userReactionDoc = await transaction.get(userReactionRef);
            const testimonyData = testimonyDoc.data();
            
            // Existing reactions map or fallback
            const reactions = testimonyData.reactions || {};
            const currentCount = reactions[reactionType] || 0;

            if (userReactionDoc.exists()) {
                const existingData = userReactionDoc.data();

                if (existingData.type === reactionType) {
                    // USER IS REMOVING THEIR REACTION
                    transaction.delete(userReactionRef);
                    transaction.update(testimonyRef, {
                        [`reactions.${reactionType}`]: Math.max(0, currentCount - 1),
                        updatedAt: serverTimestamp()
                    });
                } else {
                    // USER IS CHANGING REACTION TYPE (e.g., from flag to upvote)
                    const oldType = existingData.type;
                    const oldTypeCount = reactions[oldType] || 0;

                    transaction.set(userReactionRef, {
                        type: reactionType,
                        updatedAt: serverTimestamp()
                    });

                    transaction.update(testimonyRef, {
                        [`reactions.${oldType}`]: Math.max(0, oldTypeCount - 1),
                        [`reactions.${reactionType}`]: currentCount + 1,
                        updatedAt: serverTimestamp()
                    });
                }
            } else {
                // USER IS ADDING A NEW REACTION
                transaction.set(userReactionRef, {
                    type: reactionType,
                    userId: userId,
                    createdAt: serverTimestamp()
                });

                transaction.update(testimonyRef, {
                    [`reactions.${reactionType}`]: currentCount + 1,
                    updatedAt: serverTimestamp()
                });
            }
        });

        // Audit log for flags/verifications
        if (reactionType === 'flag' || reactionType === 'verify') {
            await logSecurityAudit('REACTION_TOGGLED', testimonyId, {
                reactionType,
                userId
            });
        }

    } catch (err) {
        console.error('Failed to toggle reaction:', err);
        showToast('Could not record your reaction. Please try again.', 'error');
    }
}

/**
 * Attaches click event delegation for reaction buttons across testimony cards.
 * @param {HTMLElement} container - Parent element containing testimony cards
 */
export function bindReactionEvents(container = document) {
    container.addEventListener('click', async (e) => {
        const btn = e.target.closest('[data-action="react"]');
        if (!btn) return;

        e.preventDefault();
        const testimonyId = btn.getAttribute('data-id');
        const reactionType = btn.getAttribute('data-type') || 'upvote';

        // UI Optimistic Feedback Toggle
        btn.classList.add('scale-95', 'opacity-75');
        setTimeout(() => btn.classList.remove('scale-95', 'opacity-75'), 150);

        await toggleReaction(testimonyId, reactionType);
    });
}
