import { db } from './firebase-config.js';
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let unsubscribeNotifs = null;

export function initNotifications(uid) {
    // 1. Clean up old listener before attaching a new one
    if (unsubscribeNotifs) {
        unsubscribeNotifs();
        unsubscribeNotifs = null;
    }

    const auth = getAuth();
    const currentUser = auth.currentUser;

    // 2. Clear UI & abort if logged out or UID mismatch
    if (!uid || !currentUser || currentUser.uid !== uid) {
        updateNotificationBadge(0);
        renderNotificationList([]);
        return;
    }

    // 3. Build query scoped to user's notifications subcollection
    const notificationsRef = collection(db, "users", uid, "notifications");
    const q = query(notificationsRef, orderBy("createdAt", "desc"));

    // 4. Attach listener with explicit error handler
    unsubscribeNotifs = onSnapshot(q, (snapshot) => {
        const notifications = [];
        let unreadCount = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (!data.read) unreadCount++;
            notifications.push({ id: docSnap.id, ...data });
        });

        updateNotificationBadge(unreadCount);
        renderNotificationList(notifications);
    }, (error) => {
        console.error("🔔 Notification Listener Error:", error.code, error.message);
        
        // If query ordering fails due to missing index/fields, fallback to unordered query
        if (error.code === 'permission-denied' || error.code === 'failed-precondition') {
            fallbackUnorderedListener(uid);
        }
    });
}

function fallbackUnorderedListener(uid) {
    if (unsubscribeNotifs) {
        unsubscribeNotifs();
    }
    const notificationsRef = collection(db, "users", uid, "notifications");
    
    unsubscribeNotifs = onSnapshot(notificationsRef, (snapshot) => {
        const notifications = [];
        let unreadCount = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (!data.read) unreadCount++;
            notifications.push({ id: docSnap.id, ...data });
        });

        // Client-side sort by createdAt as fallback
        notifications.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

        updateNotificationBadge(unreadCount);
        renderNotificationList(notifications);
    }, (err) => {
        console.error("🔔 Fallback Listener Error:", err);
    });
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notification-badge');
    const tag = document.getElementById('notification-count-tag');

    if (badge) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.toggle('hidden', count === 0);
    }

    if (tag) {
        tag.textContent = `${count} new`;
    }
}

function renderNotificationList(notifications) {
    const listContainer = document.getElementById('notification-list');
    if (!listContainer) return;

    if (notifications.length === 0) {
        listContainer.innerHTML = `
            <div class="p-8 text-center text-zinc-500">
                <p class="text-2xl mb-1">🔔</p>
                <p class="text-sm">No notifications yet</p>
            </div>`;
        return;
    }

    // Render list items...
}
