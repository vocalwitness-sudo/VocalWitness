// js/reactions.js - Multi-Reaction System (Respect, Truth, Concern, Impact)
import { db, auth } from './firebase-config.js';
import { doc, updateDoc, increment, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';

const REACTION_TYPES = {
    respect: { emoji: '👍', label: 'Respect' },
    truth: { emoji: '💡', label: 'Truth' },
    concern: { emoji: '⚠️', label: 'Concern' },
    impact: { emoji: '🔥', label: 'Impact' }
};

export async function handleReaction(postId, reactionType) {
    if (!auth.currentUser) {
        showToast("Please log in to react to testimonies.", "error");
        return;
    }

    if (!REACTION_TYPES[reactionType]) {
        showToast("Invalid reaction type.", "error");
        return;
    }

    try {
        const userId = auth.currentUser.uid;
        const reactionRef = doc(db, "testimonies", postId, "userReactions", userId);
        const postRef = doc(db, "testimonies", postId);

        // Check if user already reacted
        const userReactionSnap = await getDoc(reactionRef);
        const previousReaction = userReactionSnap.exists() ? userReactionSnap.data().type : null;

        if (previousReaction === reactionType) {
            // Toggle off if clicking the same reaction
            await setDoc(reactionRef, { type: null, updatedAt: new Date() });
            await updateDoc(postRef, {
                [`reactions.${reactionType}`]: increment(-1)
            });
            showToast(`Removed ${REACTION_TYPES[reactionType].label} reaction`, "info");
            return;
        }

        // Set new reaction
        await setDoc(reactionRef, { type: reactionType, updatedAt: new Date() });

        const updates = {
            [`reactions.${reactionType}`]: increment(1)
        };

        // Decrement old reaction if changing type
        if (previousReaction && REACTION_TYPES[previousReaction]) {
            updates[`reactions.${previousReaction}`] = increment(-1);
        }

        await updateDoc(postRef, updates);
        showToast(`${REACTION_TYPES[reactionType].emoji} Reaction recorded!`, "success");

    } catch (e) {
        console.error("Reaction failed:", e);
        showToast("Failed to record reaction.", "error");
    }
}
