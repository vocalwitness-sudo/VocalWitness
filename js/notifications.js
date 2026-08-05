// notification.js
import { db } from '/js/firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let unsubscribeNotifs = null;
let authObserver = null;

export function initNotifications(targetUid) {
    // 1. Clean up existing listeners & observers before starting new ones
    stopNotificationListener();

    const auth = getAuth();

    // 2. Wrap initialization in onAuthStateChanged to survive Auth hydration timing
    if (authObserver) authObserver(); // Unsubscribe previous observer if any

    authObserver = onAuthStateChanged(auth, (user) => {
        // If logged out or target UID doesn't match authenticated user, stop & clear UI
        if (!user || user.uid !== targetUid) {
            stopNotificationListener();
            updateNotificationBadge(0);
            renderNotificationList([]);
            return;
        }

        // Avoid attaching multiple duplicate listeners if already listening for this user
        if (unsubscribeNotifs) return;

        attachNotificationListener(user.uid);
    });
}

function attachNotificationListener(uid) {
    const notificationsRef = collection(db, "users", uid, "notifications");
    const q = query(notificationsRef, orderBy("createdAt", "desc"));

    unsubscribeNotifs = onSnapshot(q, (snapshot) => {
        handleSnapshot(snapshot);
    }, (error) => {
        // If error is permission-denied, auth token might be missing or expired
        if (error.code === 'permission-denied') {
            console.warn("🔔 Notification listener permission-denied. Detaching listener to prevent error loop.");
            stopNotificationListener();
            return;
        }

        console.warn("🔔 Ordered query failed (missing index or missing createdAt). Trying fallback...", error.code);
        
        // Detach ordered listener before running fallback
        if (unsubscribeNotifs) {
            unsubscribeNotifs();
            unsubscribeNotifs = null;
        }

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
        if (err.code === 'permission-denied') {
            console.warn("🔔 Notification fallback permission-denied. Auth state changed or missing.");
            stopNotificationListener();
        } else {
            console.error("🔔 Fallback Notification Listener Error:", err);
        }
    });
}

export function stopNotificationListener() {
    if (unsubscribeNotifs) {
        unsubscribeNotifs();
        unsubscribeNotifs = null;
    }
    if (authObserver) {
        authObserver();
        authObserver = null;
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

    // Optional: Render items into container if array has items
}
