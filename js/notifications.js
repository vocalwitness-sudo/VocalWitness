import { db } from './firebase-config.js';
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let unsubscribeNotifs = null;

export function initNotifications(uid) {
    // 1. Clean up old listener before attaching a new one
    if (unsubscribeNotifs) {
        unsubscribeNotifs();
        unsubscribeNotifs = null;
    }

    // 2. Clear UI when logged out
    if (!uid) {
        updateNotificationBadge(0);
        renderNotificationList([]);
        return;
    }

    const q = query(
        collection(db, "users", uid, "notifications"),
        orderBy("createdAt", "desc")
    );

    // 3. Attach listener with error callback
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
        console.error("🔔 Notification Listener Error:", error);
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
