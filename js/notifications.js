import { db, auth } from './firebase-config.js';
import { collection, query, orderBy, onSnapshot, updateDoc, doc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

export function initNotifications(uid) {
    if (!uid) return;

    const q = query(
        collection(db, "users", uid, "notifications"),
        orderBy("createdAt", "desc")
    );

    // Real-time listener for user notifications
    onSnapshot(q, (snapshot) => {
        const notifications = [];
        let unreadCount = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (!data.read) unreadCount++;
            notifications.push({ id: docSnap.id, ...data });
        });

        updateNotificationBadge(unreadCount);
        renderNotificationList(notifications);
    });
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notification-badge');
    if (badge) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.toggle('hidden', count === 0);
    }
}
