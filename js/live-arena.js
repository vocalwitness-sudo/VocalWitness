// js/live-arena.js – Full Live Arena Engine (Phase 1 – Globe Ready)
// Soft-launch: anyone can create & join. 500 is only a community goal.

import { listenToVerifiedCount, showToast } from './utils.js';
import { requireAuth } from './auth.js';
import { auth, db } from './firebase-config.js';
import { getCurrentUserTier, TIERS } from './tier.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
  doc,
  updateDoc,
  serverTimestamp,
  getDoc,
  deleteDoc,
  increment
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const GOAL = 500;
let roomsUnsubscribe = null;

export function initLiveArena() {
  console.log('[LiveArena] Full engine starting…');

  // Soft progress counter (never blocks anything)
  listenToVerifiedCount((count) => {
    const countEl = document.getElementById('verifiedCount');
    const progressBar = document.getElementById('verifiedProgress');
    const progressText = document.getElementById('progressText');

    if (countEl) countEl.textContent = count.toLocaleString();

    if (progressBar) {
      const percentage = Math.min((count / GOAL) * 100, 100);
      progressBar.style.width = `${percentage}%`;
    }

    if (progressText) {
      if (count >= GOAL) {
        progressText.textContent = "🎉 Full global stages unlocked!";
        progressText.classList.add('text-emerald-400', 'font-medium');
      } else {
        progressText.textContent = `${(GOAL - count).toLocaleString()} more citizens needed for mega-stages`;
      }
    }
  });

  // Live rooms listener
  if (roomsUnsubscribe) roomsUnsubscribe();

  const roomsQuery = query(
    collection(db, 'liveRooms'),
    where('isLive', '==', true),
    orderBy('participantCount', 'desc'),
    limit(60)
  );

  roomsUnsubscribe = onSnapshot(roomsQuery, (snap) => {
    const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderRooms(rooms);
  }, (err) => {
    console.warn('[LiveArena] Rooms listener error:', err);
    showToast('Could not load live rooms (check connection)', 'warning');
  });

  // Wire create button (works on both index.html and live-arena.html)
  const createBtn = document.getElementById('createRoomBtn');
  if (createBtn && !createBtn.dataset.wired) {
    createBtn.dataset.wired = 'true';
    createBtn.addEventListener('click', createRoom);
  }

  // Cleanup
  window.addEventListener('beforeunload', () => {
    if (typeof roomsUnsubscribe === 'function') roomsUnsubscribe();
  });
}

function renderRooms(rooms) {
  const grid = document.getElementById('liveRoomsGrid');
  if (!grid) return;

  if (!rooms || rooms.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-20 text-center text-zinc-500">
        <div class="text-6xl mb-5">🌍</div>
        <p class="text-xl font-medium text-zinc-300">No live rooms yet</p>
        <p class="text-sm mt-2 max-w-md mx-auto">Be the first citizen to open a stage. The world is listening.</p>
      </div>`;
    return;
  }

  grid.innerHTML = rooms.map(room => `
    <div class="glass rounded-2xl border border-sky-500/25 p-5 hover:border-sky-400/50 transition-all cursor-pointer group active:scale-[0.98]"
         onclick="window.joinLiveRoom('${room.id}')">
      <div class="flex items-start justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="relative flex h-2.5 w-2.5">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
          <span class="text-[11px] font-bold tracking-wide text-red-400">LIVE</span>
        </div>
        <span class="text-xs text-zinc-400 font-medium">${room.participantCount || 0} listening</span>
      </div>

      <h4 class="font-bold text-white text-lg leading-snug group-hover:text-sky-300 transition line-clamp-2">
        ${escapeHTML(room.title || 'Untitled Room')}
      </h4>
      
      ${room.description ? `
        <p class="text-sm text-zinc-400 mt-1.5 line-clamp-2">${escapeHTML(room.description)}</p>
      ` : ''}

      <div class="mt-4 flex items-center justify-between text-xs">
        <span class="text-zinc-500 flex items-center gap-1">
          ${room.city ? `📍 ${escapeHTML(room.city)}` : '🌐 Global'}
        </span>
        <span class="px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-400 font-medium">
          ${escapeHTML(room.tierRequired || 'Open')}
        </span>
      </div>
    </div>
  `).join('');
}

async function createRoom() {
  if (!requireAuth("Sign in to start a Live Arena room for the world")) return;

  const title = prompt("Room title\n(e.g. Lagos Traffic Chaos – Happening Now)");
  if (!title || title.trim().length < 6) {
    showToast("Title must be at least 6 characters", "warning");
    return;
  }

  const description = prompt("Short description (optional – helps people decide to join)") || "";
  const userTier = await getCurrentUserTier();

  try {
    const roomData = {
      title: title.trim().slice(0, 120),
      description: description.trim().slice(0, 300),
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      isLive: true,
      participantCount: 1,
      tierRequired: userTier === TIERS.CITIZEN ? 'Open' : userTier,
      city: null,          // later: auto-detect or ask
      tags: [],
      lastActivityAt: serverTimestamp()
    };

    const roomRef = await addDoc(collection(db, 'liveRooms'), roomData);

    // Also add creator as first participant
    await addDoc(collection(db, 'liveRooms', roomRef.id, 'participants'), {
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || 'Citizen',
      tier: userTier,
      joinedAt: serverTimestamp(),
      isSpeaking: false,
      isMuted: false
    });

    showToast("Room created! Opening stage…", "success");
    window.joinLiveRoom(roomRef.id);
  } catch (err) {
    console.error('[LiveArena] Create room failed:', err);
    showToast("Could not create room. Please try again.", "error");
  }
}

// Global join function (will be expanded with full stage + WebRTC next)
window.joinLiveRoom = async function (roomId) {
  if (!requireAuth("Sign in to join a live room")) return;

  showToast("Joining room…", "info");

  try {
    // Increment participant count
    await updateDoc(doc(db, 'liveRooms', roomId), {
      participantCount: increment(1),
      lastActivityAt: serverTimestamp()
    });

    // Add user to participants subcollection
    const userTier = await getCurrentUserTier();
    await addDoc(collection(db, 'liveRooms', roomId, 'participants'), {
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || 'Citizen',
      tier: userTier,
      joinedAt: serverTimestamp(),
      isSpeaking: false,
      isMuted: false
    });

    // For now open the dedicated page or show toast.
    // Next step we will inject the full Active Room UI.
    window.location.href = `/live-arena.html?room=${roomId}`;
    // OR if you prefer SPA: showActiveRoom(roomId);
  } catch (err) {
    console.error(err);
    showToast("Failed to join room", "error");
  }
};

// Keep the old notify function for backward compatibility
export async function notifyLiveArena() {
  const btn = document.getElementById('notifyArenaBtn');
  if (!requireAuth("Please sign in to get notified")) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }

  try {
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      interestedInArena: true,
      arenaNotifyAt: serverTimestamp()
    });
    showToast("✅ You're on the list! We'll notify you for major stages.", "success");
    if (btn) {
      btn.textContent = "✅ On the list";
      btn.classList.remove("from-rose-500", "to-pink-500");
      btn.classList.add("from-emerald-500", "to-teal-500");
    }
  } catch (error) {
    console.error(error);
    showToast("Something went wrong", "error");
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🔔 Notify Me";
    }
  }
}

window.notifyLiveArena = notifyLiveArena;

window.goBack = function () {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = '/';
  }
};

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Auto-start when the module loads (for dedicated page)
if (document.getElementById('liveRoomsGrid') || document.getElementById('verifiedCount')) {
  initLiveArena();
}
