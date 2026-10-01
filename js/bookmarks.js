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
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';

// In-memory cache for ultra-fast checks across feed renders
const bookmarkCache = new Set();
let bookmarkUnsubscribeHandler = null;

/**
 * Toggles a bookmark for a post/testimony/item.
 * @param {string} itemId
 * @param {Object} itemMetaData
 * @returns {Promise<boolean>} true if bookmarked, false if removed
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
    await deleteDoc(bookmarkRef);
    bookmarkCache.delete(itemId);
    return false;
  } else {
    const payload = {
      itemId,
      itemType: itemMetaData.itemType || itemMetaData.type || 'post',
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
 */
export async function isItemBookmarked(itemId) {
  const user = auth.currentUser;
  if (!user || !itemId) return false;

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
      return { id: docSnap.id, ...docSnap.data() };
    });
  } catch (err) {
    console.error("[Bookmarks] Fetch error:", err);
    return [];
  }
}

/**
 * Real-time subscriber for user bookmarks.
 */
export function subscribeToBookmarks(callback) {
  const user = auth.currentUser;
  if (!user) return null;

  const bookmarksRef = collection(db, "users", user.uid, "bookmarks");
  const q = query(bookmarksRef, orderBy("savedAt", "desc"));

  return onSnapshot(
    q,
    (snapshot) => {
      bookmarkCache.clear();
      const items = snapshot.docs.map(docSnap => {
        bookmarkCache.add(docSnap.id);
        return { id: docSnap.id, ...docSnap.data() };
      });
      if (typeof callback === 'function') {
        callback(items);
      }
    },
    (err) => {
      console.error("[Bookmarks] Subscription error:", err);
    }
  );
}

/**
 * Renders the Bookmarks view panel (with back/close button).
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
        <button type="button" data-action="close-bookmarks"
                class="mt-6 px-5 py-2.5 rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-emerald-500/60 hover:text-emerald-400 transition">
          ← Back
        </button>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="space-y-6 glass rounded-3xl p-6 sm:p-8 border border-zinc-800">
      <!-- Header with back button -->
      <div class="flex items-center justify-between pb-4 border-b border-zinc-800 gap-3">
        <div class="flex items-center gap-3 min-w-0">
          <button type="button"
                  id="bookmarks-back-btn"
                  data-action="close-bookmarks"
                  aria-label="Close bookmarks"
                  class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-zinc-700 bg-zinc-900 text-zinc-400 transition-all hover:border-emerald-500/60 hover:text-emerald-400 hover:bg-emerald-500/10 active:scale-95">
            <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
          </button>
          <h2 class="text-xl sm:text-2xl font-bold text-white flex items-center gap-2 truncate">
            <span>🔖</span> Saved Bookmarks
          </h2>
        </div>
        <span id="bookmark-count"
              class="text-xs bg-emerald-950 text-emerald-400 px-3 py-1 rounded-full border border-emerald-800 font-semibold shrink-0">
          Loading...
        </span>
      </div>

      <div id="bookmarks-list" class="space-y-4">
        <div class="text-center py-12 text-zinc-500 animate-pulse">Loading saved items...</div>
      </div>
    </div>`;

  // Wire the back button (in case data-action handler is not global)
  const backBtn = document.getElementById('bookmarks-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      if (typeof window.closeBookmarksView === 'function') {
        window.closeBookmarksView();
      } else if (typeof window.showFeed === 'function') {
        window.showFeed();
      } else {
        // Fallback: try to trigger the same data-action system
        backBtn.dispatchEvent(new CustomEvent('action', { bubbles: true, detail: { action: 'close-bookmarks' } }));
      }
    });
  }

  const listEl = document.getElementById('bookmarks-list');
  const countEl = document.getElementById('bookmark-count');

  try {
    const bookmarks = await getUserBookmarks();

    if (countEl) {
      countEl.textContent = `${bookmarks.length} Saved`;
    }

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
      const savedDate = item.savedAt?.toDate
        ? item.savedAt.toDate().toLocaleDateString()
        : 'Recently';

      html += `
        <div class="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800 flex items-center justify-between gap-3 hover:border-zinc-700 transition">
          <div class="space-y-1 min-w-0">
            <span class="text-xs font-mono uppercase tracking-wider text-emerald-400">
              ${escapeHtml(item.itemType || 'Post')}
            </span>
            <h4 class="text-base font-semibold text-white truncate">
              ${escapeHtml(item.title || 'Saved Item')}
            </h4>
            <p class="text-xs text-zinc-500">Saved on ${escapeHtml(savedDate)}</p>
          </div>
          <button data-remove-id="${escapeHtml(item.id)}"
                  class="btn-remove-bookmark shrink-0 px-3 py-1.5 bg-red-950/40 hover:bg-red-900/60 border border-red-800 text-red-300 text-xs rounded-xl transition cursor-pointer">
            Remove
          </button>
        </div>`;
    });

    listEl.innerHTML = html;

    // Programmatic listeners (CSP-safe)
    listEl.querySelectorAll('.btn-remove-bookmark').forEach(button => {
      button.addEventListener('click', async (e) => {
        const itemId = e.currentTarget.dataset.removeId;
        if (itemId) {
          await window.removeBookmarkItem(itemId);
        }
      });
    });
  } catch (err) {
    console.error("Error loading bookmarks view:", err);
    listEl.innerHTML = `
      <div class="text-red-400 text-center py-8">
        Failed to load bookmarks. Please try again.
      </div>`;
  }
}

/**
 * Removes a bookmark from the bookmarks view and refreshes.
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

/**
 * Close helper – call this from your main router / data-action handler.
 * Example in your main app:
 *   if (action === 'close-bookmarks') window.closeBookmarksView();
 */
window.closeBookmarksView = function () {
  // Prefer your existing navigation helpers
  if (typeof window.showFeed === 'function') {
    window.showFeed();
    return;
  }
  if (typeof window.navigateTo === 'function') {
    window.navigateTo('feed');
    return;
  }
  // Last resort – clear the dynamic container
  const container = document.getElementById('dynamicContainer') || document.getElementById('main-content');
  if (container) {
    container.innerHTML = '';
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
 * Initializer – pre-warms cache + real-time listener.
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

  if (!bookmarkUnsubscribeHandler) {
    bookmarkUnsubscribeHandler = subscribeToBookmarks((items) => {
      console.log(`[Bookmarks] Cache pre-warmed with ${items.length} items.`);
    });
  }
}

// Global window assignment
if (typeof window !== 'undefined') {
  window.initBookmarks = initBookmarks;
  window.initBookmarksView = initBookmarksView;
  window.toggleBookmark = toggleBookmark;
  window.closeBookmarksView = window.closeBookmarksView;
}
