// js/notifications.js - Real-time Notification Listener & Fallback Engine
import { db } from './firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { collection, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let unsubscribeNotifs = null;
let authObserver = null;
let currentSubscribedUid = null;

/**
 * Initializes notification tracking for the target user.
 * @param {string|null} targetUid 
 */
export function initNotifications(targetUid) {
    // Standard cleanup before establishing new listeners
    stopNotificationListener();

    if (!targetUid) {
        updateNotificationBadge(0);
        renderNotificationList([]);
        return;
    }

    const auth = getAuth();

    if (authObserver) {
        authObserver();
        authObserver = null;
    }

    authObserver = onAuthStateChanged(auth, (user) => {
        if (!user || user.uid !== targetUid) {
            stopNotificationListener();
            updateNotificationBadge(0);
            renderNotificationList([]);
            return;
        }

        if (unsubscribeNotifs && currentSubscribedUid === user.uid) {
            return;
        }

        attachNotificationListener(user.uid);
    });
}

function attachNotificationListener(uid) {
    currentSubscribedUid = uid;
    const notificationsRef = collection(db, "users", uid, "notifications");
    const q = query(notificationsRef, orderBy("createdAt", "desc"));

    unsubscribeNotifs = onSnapshot(q, (snapshot) => {
        handleSnapshot(snapshot);
    }, (error) => {
        if (error.code === 'permission-denied') {
            console.warn("🔔 Notification listener permission-denied. Stopping listener.");
            stopNotificationListener();
            return;
        }

        console.warn("🔔 Notification ordered query failed or requires index. Activating fallback...", error.code);

        if (unsubscribeNotifs) {
            unsubscribeNotifs();
            unsubscribeNotifs = null;
        }

        fallbackUnorderedListener(uid);
    });
}

function fallbackUnorderedListener(uid) {
    currentSubscribedUid = uid;
    const notificationsRef = collection(db, "users", uid, "notifications");

    unsubscribeNotifs = onSnapshot(notificationsRef, (snapshot) => {
        const notifications = [];
        let unreadCount = 0;

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (!data.read) unreadCount++;
            notifications.push({ id: docSnap.id, ...data });
        });

        // Client-side timestamp sorting fallback
        notifications.sort((a, b) => {
            const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : new Date(a.createdAt || 0).getTime();
            const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : new Date(b.createdAt || 0).getTime();
            return timeB - timeA;
        });

        updateNotificationBadge(unreadCount);
        renderNotificationList(notifications);
    }, (err) => {
        if (err.code === 'permission-denied') {
            console.warn("🔔 Fallback notification listener permission-denied.");
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
    currentSubscribedUid = null;
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

    if (!notifications || notifications.length === 0) {
        listContainer.innerHTML = `
            <div class="p-8 text-center text-zinc-500">
                <p class="text-2xl mb-1">🔔</p>
                <p class="text-sm">No notifications yet</p>
            </div>`;
        return;
    }

    let html = '<div class="divide-y divide-zinc-800/60">';
    notifications.forEach((item) => {
        const isUnread = !item.read;
        const timeStr = item.createdAt?.toDate ? item.createdAt.toDate().toLocaleString() : 'Recently';

        html += `
            <div class="p-4 hover:bg-zinc-800/40 transition ${isUnread ? 'bg-emerald-950/20' : ''}">
                <div class="flex items-start justify-between gap-2">
                    <p class="text-xs font-semibold text-zinc-200">${escapeHTML(item.title || 'System Notification')}</p>
                    <span class="text-[10px] text-zinc-500 whitespace-nowrap">${timeStr}</span>
                </div>
                <p class="text-xs text-zinc-400 mt-1">${escapeHTML(item.message || item.body || '')}</p>
            </div>`;
    });
    html += '</div>';

    listContainer.innerHTML = html;
}

function escapeHTML(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
