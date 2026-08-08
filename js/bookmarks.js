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
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { showToast } from './utils.js';

// In-memory cache for ultra-fast checks across feed renders
const bookmarkCache = new Set();
let bookmarkUnsubscribeHandler = null;

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
            savedAt: serverTimestamp()
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

/**
 * Renders the Bookmarks view panel inside the main content container.
 */
export async function initBookmarksView() {
    const container = document.getElementById('dynamicContainer') || document.getElementById('main-content');
    if (!container) return;

    if (!auth.currentUser) {
        container.innerHTML = `
            <div class="glass rounded-3xl p-12 text-center text-zinc-400 border border-zinc-800">
                <div class="text-4xl mb-3">🔖</div>
                <h3 class="text-xl font-semibold text-white mb-2">Saved Bookmarks</h3>
                <p class="text-xs text-zinc-500">Please sign in to view your saved testimonies and posts.</p>
            </div>`;
        return;
    }

    container.innerHTML = `
        <div class="space-y-6 glass rounded-3xl p-8 border border-zinc-800">
            <div class="flex items-center justify-between pb-4 border-b border-zinc-800">
                <h2 class="text-2xl font-bold text-white flex items-center gap-2">
                    <span>🔖</span> Saved Bookmarks
                </h2>
                <span id="bookmark-count" class="text-xs bg-emerald-950 text-emerald-400 px-3 py-1 rounded-full border border-emerald-800 font-semibold">
                    Loading...
                </span>
            </div>
            <div id="bookmarks-list" class="space-y-4">
                <div class="text-center py-12 text-zinc-500 animate-pulse">Loading saved items...</div>
            </div>
        </div>`;

    const listEl = document.getElementById('bookmarks-list');
    const countEl = document.getElementById('bookmark-count');

    try {
        const bookmarks = await getUserBookmarks();
        if (countEl) countEl.textContent = `${bookmarks.length} Saved`;

        if (bookmarks.length === 0) {
            listEl.innerHTML = `
                <div class="text-center py-12 text-zinc-500">
                    <p class="text-base font-medium text-zinc-400">No saved items found.</p>
                    <p class="text-xs text-zinc-600 mt-1">Bookmark posts in the feed to access them quickly here.</p>
                </div>`;
            return;
        }

        let html = '';
        bookmarks.forEach(item => {
            const savedDate = item.savedAt?.toDate ? item.savedAt.toDate().toLocaleDateString() : 'Recently';
            html += `
                <div class="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between hover:border-zinc-700 transition">
                    <div class="space-y-1">
                        <span class="text-xs font-mono uppercase tracking-wider text-emerald-400">${item.itemType || 'Post'}</span>
                        <h4 class="text-base font-semibold text-white">${escapeHtml(item.title || 'Saved Item')}</h4>
                        <p class="text-xs text-zinc-500">Saved on ${savedDate}</p>
                    </div>
                    <button onclick="window.removeBookmarkItem('${item.id}')" class="px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-300 text-xs rounded-xl transition">
                        Remove
                    </button>
                </div>`;
        });
        listEl.innerHTML = html;

    } catch (err) {
        console.error("Error loading bookmarks view:", err);
        listEl.innerHTML = `<div class="text-red-400 text-center py-8">Failed to load bookmarks. Please try again.</div>`;
    }
}

/**
 * Removes a bookmark directly from the bookmarks view.
 */
window.removeBookmarkItem = async (itemId) => {
    try {
        await toggleBookmark(itemId);
        showToast("Bookmark removed", "info");
        initBookmarksView();
    } catch (err) {
        showToast("Failed to remove bookmark", "error");
    }
};

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Initializer function called on app boot up.
 * Pre-warms the cache and sets up real-time listener if a user is logged in.
 */
export function initBookmarks() {
    const user = auth.currentUser;
    if (!user) {
        bookmarkCache.clear();
        if (bookmarkUnsubscribeHandler) {
            bookmarkUnsubscribeHandler();
            bookmarkUnsubscribeHandler = null;
        }
        return;
    }

    // Subscribe to populate local cache in real time
    if (!bookmarkUnsubscribeHandler) {
        bookmarkUnsubscribeHandler = subscribeToBookmarks((items) => {
            console.log(`[Bookmarks] Cache pre-warmed with ${items.length} items.`);
        });
    }
}

// Global window assignment to ensure cross-module compatibility
if (typeof window !== 'undefined') {
    window.initBookmarks = initBookmarks;
    window.initBookmarksView = initBookmarksView;
    window.toggleBookmark = toggleBookmark;
}
