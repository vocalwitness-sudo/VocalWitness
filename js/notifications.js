//notification.js
import { db } from '/js/firebase-config.js';
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let unsubscribeNotifs = null;

export function initNotifications(uid) {
    // 1. Clean up old listener before attaching a new one
    stopNotificationListener();

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

    // 4. Attach listener
    unsubscribeNotifs = onSnapshot(q, (snapshot) => {
        handleSnapshot(snapshot);
    }, (error) => {
        console.warn("🔔 Ordered Notification Listener failed, trying unordered fallback...", error.code);
        
        // Stop the failed listener before starting the fallback
        stopNotificationListener();

        // Fallback to unordered query (prevents index/null field permission drops)
        fallbackUnorderedListener(uid);
    });
}

function fallbackUnorderedListener(uid) {
    const notificationsRef = collection(db, "users", uid, "notifications");
    
    unsubscribeNotifs = onSnapshot(notificationsRef, (snapshot) => {
        const notifications = [];
        let unreadCount = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (!data.read) unreadCount++;
            notifications.push({ id: docSnap.id, ...data });
        });

        // Safe client-side sort handling missing timestamps
        notifications.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
            return timeB - timeA;
        });

        updateNotificationBadge(unreadCount);
        renderNotificationList(notifications);
    }, (err) => {
        console.error("🔔 Notification Listener Error: permission-denied Missing or insufficient permissions.", err);
    });
}

function stopNotificationListener() {
    if (unsubscribeNotifs) {
        unsubscribeNotifs();
        unsubscribeNotifs = null;
    }
}

function handleSnapshot(snapshot) {
    const notifications = [];
    let unreadCount = 0;

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.read) unreadCount++;
        notifications.push({ id: docSnap.id, ...data });
    });

    updateNotificationBadge(unreadCount);
    renderNotificationList(notifications);
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
}
