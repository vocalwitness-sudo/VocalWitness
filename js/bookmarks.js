/**
 * VocalWitness Bookmarks Module (js/bookmarks.js)
 * Handles user saved posts and testimonies under /users/{userId}/bookmarks/{bookmarkId}
 */

import { auth, db } from './firebase-config.js';
import { 
    doc, 
    setDoc, 
    deleteDoc, 
    getDoc, 
    collection, 
    getDocs, 
    query, 
    orderBy,
    onSnapshot 
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// In-memory cache for ultra-fast checks across feed renders
const bookmarkCache = new Set();

/**
 * Toggles a bookmark for a post/testimony/item.
 * 
 * @param {string} itemId - The ID of the item being bookmarked.
 * @param {Object} itemMetaData - Basic metadata (title, itemType, authorId).
 * @returns {Promise<boolean>} Resolves true if bookmarked, false if removed.
 */
export async function toggleBookmark(itemId, itemMetaData = {}) {
    const user = auth.currentUser;
    if (!user) {
        throw new Error("Must be logged in to save bookmarks.");
    }

    if (!itemId) {
        throw new Error("Missing itemId for bookmark operation.");
    }

    const bookmarkRef = doc(db, "users", user.uid, "bookmarks", itemId);
    const existingSnap = await getDoc(bookmarkRef);

    if (existingSnap.exists()) {
        // Already bookmarked -> Remove it
        await deleteDoc(bookmarkRef);
        bookmarkCache.delete(itemId);
        return false;
    } else {
        // Add bookmark record
        const payload = {
            itemId: itemId,
            itemType: itemMetaData.itemType || itemMetaData.type || 'post', // 'testimony' (Witness Voice) or 'post' (Citizen Talk)
            title: itemMetaData.title || 'Saved Item',
            authorId: itemMetaData.authorId || '',
            savedAt: new Date().toISOString()
        };

        await setDoc(bookmarkRef, payload);
        bookmarkCache.add(itemId);
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
    if (!user || !itemId) return false;

    // Check fast local cache first
    if (bookmarkCache.has(itemId)) return true;

    try {
        const bookmarkRef = doc(db, "users", user.uid, "bookmarks", itemId);
        const snap = await getDoc(bookmarkRef);

        if (snap.exists()) {
            bookmarkCache.add(itemId);
            return true;
        }
        return false;
    } catch (err) {
        console.error(`[Bookmarks] Check error for item ${itemId}:`, err);
        return false;
    }
}

/**
 * Fetches all bookmarked items for the logged-in user.
 * 
 * @returns {Promise<Array>} List of bookmark objects.
 */
export async function getUserBookmarks() {
    const user = auth.currentUser;
    if (!user) return [];

    try {
        const bookmarksRef = collection(db, "users", user.uid, "bookmarks");
        const q = query(bookmarksRef, orderBy("savedAt", "desc"));
        const snapshot = await getDocs(q);

        bookmarkCache.clear();
        return snapshot.docs.map(docSnap => {
            bookmarkCache.add(docSnap.id);
            return {
                id: docSnap.id,
                ...docSnap.data()
            };
        });
    } catch (err) {
        console.error("[Bookmarks] Fetch error:", err);
        return [];
    }
}

/**
 * Sets up a real-time subscriber for user bookmarks.
 * 
 * @param {Function} callback - Callback receiving array of saved items.
 * @returns {Function|null} Unsubscribe handler.
 */
export function subscribeToBookmarks(callback) {
    const user = auth.currentUser;
    if (!user) return null;

    const bookmarksRef = collection(db, "users", user.uid, "bookmarks");
    const q = query(bookmarksRef, orderBy("savedAt", "desc"));

    return onSnapshot(q, (snapshot) => {
        bookmarkCache.clear();
        const items = snapshot.docs.map(docSnap => {
            bookmarkCache.add(docSnap.id);
            return {
                id: docSnap.id,
                ...docSnap.data()
            };
        });

        if (typeof callback === 'function') {
            callback(items);
        }
    }, (err) => {
        console.error("[Bookmarks] Subscription error:", err);
    });
}
