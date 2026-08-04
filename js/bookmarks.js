/**
 * VocalWitness Bookmarks Module (js/bookmarks.js)
 */

import { auth, db } from './firebaseConfig.js';
import { 
    doc, 
    setDoc, 
    deleteDoc, 
    getDoc, 
    collection, 
    getDocs, 
    query, 
    orderBy 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/**
 * Toggles a bookmark for a post/testimony/item.
 * 
 * @param {string} itemId - The ID of the item being bookmarked.
 * @param {Object} itemMetaData - Basic metadata to cache (title, itemType, authorId, createdAt).
 * @returns {Promise<boolean>} Resolves true if bookmarked, false if removed.
 */
export async function toggleBookmark(itemId, itemMetaData = {}) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("Must be logged in to save bookmarks.");
    }

    const bookmarkRef = doc(db, "users", user.uid, "bookmarks", itemId);
    const existingSnap = await getDoc(bookmarkRef);

    if (existingSnap.exists()) {
        // Already bookmarked -> Remove it
        await deleteDoc(bookmarkRef);
        return false;
    } else {
        // Add bookmark record
        await setDoc(bookmarkRef, {
            itemId: itemId,
            itemType: itemMetaData.itemType || 'post', // 'testimony', 'feed', 'post'
            title: itemMetaData.title || '',
            authorId: itemMetaData.authorId || '',
            savedAt: new Date().toISOString()
        });
        return true;
    }
}

/**
 * Checks if a specific item is bookmarked by the current user.
 * 
 * @param {string} itemId 
 * @returns {Promise<boolean>}
 */
export async function isItemBookmarked(itemId) {
    const user = auth.currentUser;
    if (!user) return false;

    const bookmarkRef = doc(db, "users", user.uid, "bookmarks", itemId);
    const snap = await getDoc(bookmarkRef);
    return snap.exists();
}

/**
 * Fetches all bookmarked items for the logged-in user.
 * 
 * @returns {Promise<Array>} List of bookmark objects.
 */
export async function getUserBookmarks() {
    const user = auth.currentUser;
    if (!user) return [];

    const bookmarksRef = collection(db, "users", user.uid, "bookmarks");
    const q = query(bookmarksRef, orderBy("savedAt", "desc"));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data()
    }));
}
