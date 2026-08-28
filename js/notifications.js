// js/notifications.js - Real-time Notification Listener & Fallback Engine
import { db } from './firebase-config.js';
import { getAuth } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let unsubscribeNotifs = null;
let currentSubscribedUid = null;

export function initNotifications(targetUid) {
  if (!targetUid) {
    stopNotificationListener();
    updateNotificationBadge(0);
    renderNotificationList([]);
    return;
  }

  const auth = getAuth();
  const currentUser = auth.currentUser;

  // GUARD: Ensure user is signed in AND matches targetUid before listening
  if (!currentUser || currentUser.uid !== targetUid) {
    stopNotificationListener();
    updateNotificationBadge(0);
    renderNotificationList([]);
    return;
  }

  // Already active for this user
  if (unsubscribeNotifs && currentSubscribedUid === targetUid) {
    return;
  }

  stopNotificationListener();
  attachNotificationListener(targetUid);
}

function attachNotificationListener(uid) {
  currentSubscribedUid = uid;
  const notificationsRef = collection(db, "users", uid, "notifications");
  const q = query(notificationsRef, orderBy("createdAt", "desc"));

  unsubscribeNotifs = onSnapshot(
    q,
    (snapshot) => {
      handleSnapshot(snapshot);
    },
    (error) => {
      if (error.code === "permission-denied") {
        console.warn(`🔔 Permission denied for path: users/${uid}/notifications`);
        stopNotificationListener();
        return;
      }
      console.warn(
        "🔔 Notification ordered query failed or requires index. Activating fallback...",
        error.code
      );

      // Clean up primary listener before starting fallback
      stopNotificationListener();
      fallbackUnorderedListener(uid);
    }
  );
}

function updateNotificationBadge(count) {
  const badge = document.getElementById("notification-badge");
  const badgeMobile = document.getElementById("notification-badge-mobile");
  const tag = document.getElementById("notification-count-tag");
  const display = count > 99 ? "99+" : count;

  if (badge) {
    badge.textContent = display;
    badge.classList.toggle("hidden", count === 0);
  }
  if (badgeMobile) {
    badgeMobile.textContent = display;
    badgeMobile.classList.toggle("hidden", count === 0);
  }
  if (tag) {
    tag.textContent = `${count} new`;
  }
}

function fallbackUnorderedListener(uid) {
  currentSubscribedUid = uid;
  const notificationsRef = collection(db, "users", uid, "notifications");

  unsubscribeNotifs = onSnapshot(
    notificationsRef,
    (snapshot) => {
      const notifications = [];
      let unreadCount = 0;

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        if (!data.read) unreadCount++;
        notifications.push({ id: docSnap.id, ...data });
      });

      // In-memory sort fallback
      notifications.sort((a, b) => {
        const timeA = parseTime(a.createdAt);
        const timeB = parseTime(b.createdAt);
        return timeB - timeA;
      });

      updateNotificationBadge(unreadCount);
      renderNotificationList(notifications);
    },
    (err) => {
      if (err.code === "permission-denied") {
        console.warn(
          `🔔 Fallback listener permission-denied for users/${uid}/notifications`
        );
        stopNotificationListener();
      } else {
        console.error("🔔 Fallback Notification Listener Error:", err);
      }
    }
  );
}

export function stopNotificationListener() {
  if (unsubscribeNotifs) {
    unsubscribeNotifs();
    unsubscribeNotifs = null;
  }
  currentSubscribedUid = null;
}

/**
 * Write a corroboration notification for the report owner.
 * Called by corroboration.js after a successful corroboration.
 */
export async function notifyCorroboration(ownerId, corroboratorId, testimonyId) {
  if (!ownerId || !corroboratorId || !testimonyId) return;

  try {
    const notifRef = doc(collection(db, "users", ownerId, "notifications"));
    await setDoc(notifRef, {
      type: "corroboration",
      title: "New corroboration",
      message: "Someone corroborated your report",
      testimonyId,
      fromUid: corroboratorId,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (err) {
    // Non-fatal – corroboration itself already succeeded
    console.warn("notifyCorroboration failed:", err);
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

function parseTime(createdAt) {
  if (!createdAt) return 0;
  if (createdAt.toMillis) return createdAt.toMillis();
  if (createdAt.toDate) return createdAt.toDate().getTime();
  const parsed = new Date(createdAt).getTime();
  return isNaN(parsed) ? 0 : parsed;
}

function renderNotificationList(notifications) {
  const listContainer = document.getElementById("notification-list");
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

    let timeStr = "Recently";
    if (item.createdAt?.toDate) {
      timeStr = item.createdAt.toDate().toLocaleString();
    } else if (item.createdAt) {
      const parsed = new Date(item.createdAt);
      if (!isNaN(parsed.getTime())) timeStr = parsed.toLocaleString();
    }

    html += `
            <div class="p-4 hover:bg-zinc-800/40 transition ${
              isUnread ? "bg-emerald-950/20" : ""
            }">
                <div class="flex items-start justify-between gap-2">
                    <p class="text-xs font-semibold text-zinc-200">${escapeHTML(
                      item.title || "System Notification"
                    )}</p>
                    <span class="text-[10px] text-zinc-500 whitespace-nowrap">${timeStr}</span>
                </div>
                <p class="text-xs text-zinc-400 mt-1">${escapeHTML(
                  item.message || item.body || ""
                )}</p>
            </div>`;
  });
  html += "</div>";
  listContainer.innerHTML = html;
}

function escapeHTML(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
