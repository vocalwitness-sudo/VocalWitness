// js/reactions.js - Multi-Reaction System (Respect, Truth, Concern, Impact)
import { db, auth } from './firebase-config.js';
import { 
    doc, 
    runTransaction, 
    serverTimestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';

export const REACTION_TYPES = {
    respect: { emoji: '👍', label: 'Respect' },
    truth: { emoji: '💡', label: 'Truth' },
    concern: { emoji: '⚠️', label: 'Concern' },
    impact: { emoji: '🔥', label: 'Impact' }
};

/**
 * Toggles or switches a reaction on a testimony document using atomic transactions.
 * @param {string} postId - ID of the testimony document
 * @param {string} reactionType - Key from REACTION_TYPES ('respect', 'truth', 'concern', 'impact')
 */
export async function handleReaction(postId, reactionType) {
    if (!auth.currentUser) {
        showToast("Please log in to react to testimonies.", "error");
        return;
    }

    if (!REACTION_TYPES[reactionType]) {
        showToast("Invalid reaction type.", "error");
        return;
    }

    const userId = auth.currentUser.uid;
    const reactionRef = doc(db, "testimonies", postId, "userReactions", userId);
    const postRef = doc(db, "testimonies", postId);

    try {
        let actionResult = "";

        await runTransaction(db, async (transaction) => {
            const reactionSnap = await transaction.get(reactionRef);
            const postSnap = await transaction.get(postRef);

            if (!postSnap.exists()) {
                throw new Error("Testimony document does not exist.");
            }

            const postData = postSnap.data();
            const currentReactions = postData.reactions || { respect: 0, truth: 0, concern: 0, impact: 0 };
            const previousReaction = reactionSnap.exists() ? reactionSnap.data().type : null;

            if (previousReaction === reactionType) {
                // Toggle Off: Remove record and decrement count
                transaction.delete(reactionRef);
                currentReactions[reactionType] = Math.max(0, (currentReactions[reactionType] || 0) - 1);
                actionResult = "removed";
            } else {
                // Set or Switch Reaction
                transaction.set(reactionRef, { 
                    type: reactionType, 
                    updatedAt: serverTimestamp() 
                });

                if (previousReaction && currentReactions[previousReaction] !== undefined) {
                    currentReactions[previousReaction] = Math.max(0, currentReactions[previousReaction] - 1);
                }

                currentReactions[reactionType] = (currentReactions[reactionType] || 0) + 1;
                actionResult = "added";
            }

            transaction.update(postRef, { reactions: currentReactions });
        });

        if (actionResult === "removed") {
            showToast(`Removed ${REACTION_TYPES[reactionType].label} reaction`, "info");
        } else {
            showToast(`${REACTION_TYPES[reactionType].emoji} Reaction recorded!`, "success");
        }

    } catch (e) {
        console.error("Reaction failed:", e);
        showToast("Failed to record reaction.", "error");
    }
}
