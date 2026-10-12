// js/live-arena.js – World-Class Live Arena (Evidence-grade)
// Part 1: imports, lobby, create room, join room

import { listenToVerifiedCount, showToast } from './utils.js';
import { requireAuth } from './auth.js';
import { auth, db } from './firebase-config.js';
import { getCurrentUserTier, TIERS } from './tier.js';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  addDoc, doc, updateDoc, serverTimestamp, getDoc,
  deleteDoc, increment, getDocs, setDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack
} from 'https://cdn.jsdelivr.net/npm/livekit-client@2.5.0/dist/livekit-client.esm.mjs';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";

const GOAL = 500;

let roomsUnsubscribe = null;
let participantsUnsubscribe = null;
let currentRoomId = null;
let isSpeaking = false;
let livekitRoom = null;
let localAudioTrack = null;
let currentFilter = 'all';
let allRoomsCache = [];
let isHost = false;
let myParticipantDocId = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Lobby boot
// ---------------------------------------------------------------------------
export function initLiveArena() {
  console.log('[LiveArena] World-class engine starting…');

  // Soft progress toward mega-stages
  listenToVerifiedCount((count) => {
    const countEl = document.getElementById('verifiedCount');
    const progressBar = document.getElementById('verifiedProgress');
    const progressText = document.getElementById('progressText');

    if (countEl) countEl.textContent = count.toLocaleString();
    if (progressBar) {
      const pct = Math.min((count / GOAL) * 100, 100);
      progressBar.style.width = `${pct}%`;
      progressBar.setAttribute('aria-valuenow', String(count));
    }
    if (progressText) {
      progressText.textContent = count >= GOAL
        ? "🎉 Full global stages unlocked!"
        : `${(GOAL - count).toLocaleString()} more citizens needed for mega-stages`;
    }
  });

  // Live rooms list
  if (roomsUnsubscribe) roomsUnsubscribe();
  const roomsQuery = query(
    collection(db, 'liveRooms'),
    where('isLive', '==', true),
    orderBy('participantCount', 'desc'),
    limit(80)
  );
  roomsUnsubscribe = onSnapshot(
    roomsQuery,
    (snap) => {
      allRoomsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      applyFilterAndRender();
    },
    (err) => {
      console.error('[LiveArena] rooms listener error:', err);
      const grid = document.getElementById('liveRoomsGrid');
      if (grid) {
        grid.innerHTML = `
          <div class="col-span-full py-16 text-center text-red-400">
            <p class="font-medium">Could not load live rooms</p>
            <p class="text-sm text-zinc-500 mt-1">Check connection or permissions, then refresh.</p>
          </div>`;
      }
    }
  );

  // Create room
  document.getElementById('createRoomBtn')?.addEventListener('click', createRoom);

  // Filters (including Protest / Weather / Election / General from HTML)
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter || 'all';
      document.querySelectorAll('[data-filter]').forEach(b => {
        b.classList.remove('bg-sky-500/20', 'text-sky-300', 'border-sky-500/40', 'border');
        b.classList.add('bg-zinc-800', 'text-zinc-400');
      });
      btn.classList.remove('bg-zinc-800', 'text-zinc-400');
      btn.classList.add('bg-sky-500/20', 'text-sky-300', 'border', 'border-sky-500/40');
      applyFilterAndRender();
    });
  });

  // Deep link: ?room=ROOM_ID
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');
  if (roomId) {
    joinLiveRoom(roomId, true);
  }

  // Cleanup on tab close
  window.addEventListener('beforeunload', () => {
    if (currentRoomId) leaveCurrentRoom(true);
  });
}

// ---------------------------------------------------------------------------
// Lobby list
// ---------------------------------------------------------------------------
function applyFilterAndRender() {
  let rooms = [...allRoomsCache];

  if (currentFilter === 'near') {
    rooms = rooms.filter(r => r.city);
  } else if (currentFilter === 'circle') {
    rooms = rooms.filter(r => r.tierRequired && r.tierRequired !== 'Open');
  } else if (currentFilter !== 'all') {
    const f = currentFilter.toLowerCase();
    rooms = rooms.filter(r =>
      (r.category || '').toLowerCase() === f ||
      (r.title || '').toLowerCase().includes(f) ||
      (r.description || '').toLowerCase().includes(f)
    );
  }

  renderRooms(rooms);
}

function renderRooms(rooms) {
  const grid = document.getElementById('liveRoomsGrid');
  if (!grid) return;

  if (!rooms.length) {
    grid.innerHTML = `
      <div class="col-span-full py-20 text-center text-zinc-500">
        <div class="text-6xl mb-5 opacity-70">🌍</div>
        <p class="text-xl font-medium text-zinc-300">No live rooms yet</p>
        <p class="text-sm mt-2 text-zinc-500">Be the first to open a stage for the world</p>
      </div>`;
    return;
  }

  grid.innerHTML = rooms.map(room => {
    const category = room.category || 'General';
    const speaking = room.speakingCount || 0;
    const reactions = room.reactions || {};
    const likes = reactions.like || 0;
    const claps = reactions.clap || 0;

    return `
    <div class="glass rounded-2xl border border-sky-500/20 p-5 hover:border-sky-400/50 hover:scale-[1.01] transition-all cursor-pointer group relative overflow-hidden"
         onclick="window.joinLiveRoom('${escapeHTML(room.id)}')"
         role="button"
         tabindex="0">
      <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-500/0 via-sky-500/60 to-sky-500/0 opacity-0 group-hover:opacity-100 transition"></div>

      <div class="flex justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="relative flex h-2.5 w-2.5">
            <span class="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
          </span>
          <span class="text-[11px] font-bold text-red-400 tracking-wide">LIVE</span>
          ${speaking > 0 ? `<span class="text-[11px] text-sky-400">${speaking} speaking</span>` : ''}
        </div>
        <span class="text-xs text-zinc-400 font-medium">${room.participantCount || 0} listening</span>
      </div>

      <h4 class="font-bold text-white text-lg group-hover:text-sky-300 line-clamp-2 leading-snug">${escapeHTML(room.title)}</h4>

      ${room.description ? `<p class="text-sm text-zinc-400 mt-1.5 line-clamp-2">${escapeHTML(room.description)}</p>` : ''}

      <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        ${claps ? `<span>👏 ${claps}</span>` : ''}
        ${likes ? `<span>👍 ${likes}</span>` : ''}
      </div>

      <div class="mt-4 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="text-zinc-500">${room.city ? '📍 ' + escapeHTML(room.city) : '🌐 Global'}</span>
          <span class="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400">${escapeHTML(category)}</span>
        </div>
        <span class="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 font-medium">${escapeHTML(room.tierRequired || 'Open')}</span>
      </div>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Create room
// ---------------------------------------------------------------------------
async function createRoom() {
  if (!requireAuth("Sign in to start a room")) return;

  const title = prompt("Room title (e.g. Lagos Traffic – Happening Right Now)");
  if (!title || title.trim().length < 6) {
    showToast("Title too short (min 6 characters)", "warning");
    return;
  }
  const description = prompt("Short description (optional)") || "";
  const category =
    prompt("Category (Traffic, Safety, Protest, Weather, Election, General)") || "General";

  try {
    const userTier = await getCurrentUserTier();
    const roomRef = await addDoc(collection(db, 'liveRooms'), {
      title: title.trim().slice(0, 120),
      description: description.trim().slice(0, 300),
      category: category.trim().slice(0, 40),
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      isLive: true,
      participantCount: 1,
      speakingCount: 0,
      reactions: { clap: 0, fire: 0, like: 0, dislike: 0 },
      tierRequired: userTier === TIERS.CITIZEN ? 'Open' : userTier,
      lastActivityAt: serverTimestamp()
    });

    await setDoc(doc(db, 'liveRooms', roomRef.id, 'participants', auth.currentUser.uid), {
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || 'Citizen',
      photoURL: auth.currentUser.photoURL || null,
      tier: userTier,
      joinedAt: serverTimestamp(),
      isSpeaking: false,
      isMuted: false,
      isHost: true,
      handRaised: false
    });

    showToast("Room created – you are the host", "success");
    joinLiveRoom(roomRef.id);
  } catch (err) {
    console.error(err);
    showToast("Failed to create room", "error");
  }
}

// ---------------------------------------------------------------------------
// Join room
// ---------------------------------------------------------------------------
window.joinLiveRoom = async function (roomId, alreadyInUrl = false) {
  if (!requireAuth("Sign in to join")) return;
  if (!roomId || currentRoomId === roomId) return;

  try {
    if (currentRoomId) await leaveCurrentRoom(true);

    currentRoomId = roomId;

    const roomSnap = await getDoc(doc(db, 'liveRooms', roomId));
    if (!roomSnap.exists()) {
      showToast("This room no longer exists", "error");
      currentRoomId = null;
      return;
    }

    const roomData = roomSnap.data() || {};
    isHost = roomData.createdBy === auth.currentUser.uid;

    await updateDoc(doc(db, 'liveRooms', roomId), {
      participantCount: increment(1),
      lastActivityAt: serverTimestamp()
    });

    const userTier = await getCurrentUserTier();
    myParticipantDocId = auth.currentUser.uid;

    await setDoc(
      doc(db, 'liveRooms', roomId, 'participants', auth.currentUser.uid),
      {
        uid: auth.currentUser.uid,
        displayName: auth.currentUser.displayName || 'Citizen',
        photoURL: auth.currentUser.photoURL || null,
        tier: userTier,
        joinedAt: serverTimestamp(),
        isSpeaking: false,
        isMuted: false,
        isHost: isHost,
        handRaised: false
      },
      { merge: true }
    );

    if (!alreadyInUrl) {
      history.pushState({}, '', `?room=${encodeURIComponent(roomId)}`);
    }

    // Defined in Part 2
    showActiveRoom(roomId, roomData);
  } catch (err) {
    console.error(err);
    currentRoomId = null;
    showToast("Could not join room", "error");
  }
};

// js/live-arena.js – World-Class Live Arena (Evidence-grade)
// Part 1: imports, lobby, create room, join room

import { listenToVerifiedCount, showToast } from './utils.js';
import { requireAuth } from './auth.js';
import { auth, db } from './firebase-config.js';
import { getCurrentUserTier, TIERS } from './tier.js';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  addDoc, doc, updateDoc, serverTimestamp, getDoc,
  deleteDoc, increment, getDocs, setDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack
} from 'https://cdn.jsdelivr.net/npm/livekit-client@2.5.0/dist/livekit-client.esm.mjs';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";

const GOAL = 500;

let roomsUnsubscribe = null;
let participantsUnsubscribe = null;
let currentRoomId = null;
let isSpeaking = false;
let livekitRoom = null;
let localAudioTrack = null;
let currentFilter = 'all';
let allRoomsCache = [];
let isHost = false;
let myParticipantDocId = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Lobby boot
// ---------------------------------------------------------------------------
export function initLiveArena() {
  console.log('[LiveArena] World-class engine starting…');

  // Soft progress toward mega-stages
  listenToVerifiedCount((count) => {
    const countEl = document.getElementById('verifiedCount');
    const progressBar = document.getElementById('verifiedProgress');
    const progressText = document.getElementById('progressText');

    if (countEl) countEl.textContent = count.toLocaleString();
    if (progressBar) {
      const pct = Math.min((count / GOAL) * 100, 100);
      progressBar.style.width = `${pct}%`;
      progressBar.setAttribute('aria-valuenow', String(count));
    }
    if (progressText) {
      progressText.textContent = count >= GOAL
        ? "🎉 Full global stages unlocked!"
        : `${(GOAL - count).toLocaleString()} more citizens needed for mega-stages`;
    }
  });

  // Live rooms list
  if (roomsUnsubscribe) roomsUnsubscribe();
  const roomsQuery = query(
    collection(db, 'liveRooms'),
    where('isLive', '==', true),
    orderBy('participantCount', 'desc'),
    limit(80)
  );
  roomsUnsubscribe = onSnapshot(
    roomsQuery,
    (snap) => {
      allRoomsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      applyFilterAndRender();
    },
    (err) => {
      console.error('[LiveArena] rooms listener error:', err);
      const grid = document.getElementById('liveRoomsGrid');
      if (grid) {
        grid.innerHTML = `
          <div class="col-span-full py-16 text-center text-red-400">
            <p class="font-medium">Could not load live rooms</p>
            <p class="text-sm text-zinc-500 mt-1">Check connection or permissions, then refresh.</p>
          </div>`;
      }
    }
  );

  // Create room
  document.getElementById('createRoomBtn')?.addEventListener('click', createRoom);

  // Filters (including Protest / Weather / Election / General from HTML)
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter || 'all';
      document.querySelectorAll('[data-filter]').forEach(b => {
        b.classList.remove('bg-sky-500/20', 'text-sky-300', 'border-sky-500/40', 'border');
        b.classList.add('bg-zinc-800', 'text-zinc-400');
      });
      btn.classList.remove('bg-zinc-800', 'text-zinc-400');
      btn.classList.add('bg-sky-500/20', 'text-sky-300', 'border', 'border-sky-500/40');
      applyFilterAndRender();
    });
  });

  // Deep link: ?room=ROOM_ID
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');
  if (roomId) {
    joinLiveRoom(roomId, true);
  }

  // Cleanup on tab close
  window.addEventListener('beforeunload', () => {
    if (currentRoomId) leaveCurrentRoom(true);
  });
}

// ---------------------------------------------------------------------------
// Lobby list
// ---------------------------------------------------------------------------
function applyFilterAndRender() {
  let rooms = [...allRoomsCache];

  if (currentFilter === 'near') {
    rooms = rooms.filter(r => r.city);
  } else if (currentFilter === 'circle') {
    rooms = rooms.filter(r => r.tierRequired && r.tierRequired !== 'Open');
  } else if (currentFilter !== 'all') {
    const f = currentFilter.toLowerCase();
    rooms = rooms.filter(r =>
      (r.category || '').toLowerCase() === f ||
      (r.title || '').toLowerCase().includes(f) ||
      (r.description || '').toLowerCase().includes(f)
    );
  }

  renderRooms(rooms);
}

function renderRooms(rooms) {
  const grid = document.getElementById('liveRoomsGrid');
  if (!grid) return;

  if (!rooms.length) {
    grid.innerHTML = `
      <div class="col-span-full py-20 text-center text-zinc-500">
        <div class="text-6xl mb-5 opacity-70">🌍</div>
        <p class="text-xl font-medium text-zinc-300">No live rooms yet</p>
        <p class="text-sm mt-2 text-zinc-500">Be the first to open a stage for the world</p>
      </div>`;
    return;
  }

  grid.innerHTML = rooms.map(room => {
    const category = room.category || 'General';
    const speaking = room.speakingCount || 0;
    const reactions = room.reactions || {};
    const likes = reactions.like || 0;
    const claps = reactions.clap || 0;

    return `
    <div class="glass rounded-2xl border border-sky-500/20 p-5 hover:border-sky-400/50 hover:scale-[1.01] transition-all cursor-pointer group relative overflow-hidden"
         onclick="window.joinLiveRoom('${escapeHTML(room.id)}')"
         role="button"
         tabindex="0">
      <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-500/0 via-sky-500/60 to-sky-500/0 opacity-0 group-hover:opacity-100 transition"></div>

      <div class="flex justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="relative flex h-2.5 w-2.5">
            <span class="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
          </span>
          <span class="text-[11px] font-bold text-red-400 tracking-wide">LIVE</span>
          ${speaking > 0 ? `<span class="text-[11px] text-sky-400">${speaking} speaking</span>` : ''}
        </div>
        <span class="text-xs text-zinc-400 font-medium">${room.participantCount || 0} listening</span>
      </div>

      <h4 class="font-bold text-white text-lg group-hover:text-sky-300 line-clamp-2 leading-snug">${escapeHTML(room.title)}</h4>

      ${room.description ? `<p class="text-sm text-zinc-400 mt-1.5 line-clamp-2">${escapeHTML(room.description)}</p>` : ''}

      <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        ${claps ? `<span>👏 ${claps}</span>` : ''}
        ${likes ? `<span>👍 ${likes}</span>` : ''}
      </div>

      <div class="mt-4 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="text-zinc-500">${room.city ? '📍 ' + escapeHTML(room.city) : '🌐 Global'}</span>
          <span class="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400">${escapeHTML(category)}</span>
        </div>
        <span class="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 font-medium">${escapeHTML(room.tierRequired || 'Open')}</span>
      </div>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Create room
// ---------------------------------------------------------------------------
async function createRoom() {
  if (!requireAuth("Sign in to start a room")) return;

  const title = prompt("Room title (e.g. Lagos Traffic – Happening Right Now)");
  if (!title || title.trim().length < 6) {
    showToast("Title too short (min 6 characters)", "warning");
    return;
  }
  const description = prompt("Short description (optional)") || "";
  const category =
    prompt("Category (Traffic, Safety, Protest, Weather, Election, General)") || "General";

  try {
    const userTier = await getCurrentUserTier();
    const roomRef = await addDoc(collection(db, 'liveRooms'), {
      title: title.trim().slice(0, 120),
      description: description.trim().slice(0, 300),
      category: category.trim().slice(0, 40),
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      isLive: true,
      participantCount: 1,
      speakingCount: 0,
      reactions: { clap: 0, fire: 0, like: 0, dislike: 0 },
      tierRequired: userTier === TIERS.CITIZEN ? 'Open' : userTier,
      lastActivityAt: serverTimestamp()
    });

    await setDoc(doc(db, 'liveRooms', roomRef.id, 'participants', auth.currentUser.uid), {
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || 'Citizen',
      photoURL: auth.currentUser.photoURL || null,
      tier: userTier,
      joinedAt: serverTimestamp(),
      isSpeaking: false,
      isMuted: false,
      isHost: true,
      handRaised: false
    });

    showToast("Room created – you are the host", "success");
    joinLiveRoom(roomRef.id);
  } catch (err) {
    console.error(err);
    showToast("Failed to create room", "error");
  }
}

// ---------------------------------------------------------------------------
// Join room
// ---------------------------------------------------------------------------
window.joinLiveRoom = async function (roomId, alreadyInUrl = false) {
  if (!requireAuth("Sign in to join")) return;
  if (!roomId || currentRoomId === roomId) return;

  try {
    if (currentRoomId) await leaveCurrentRoom(true);

    currentRoomId = roomId;

    const roomSnap = await getDoc(doc(db, 'liveRooms', roomId));
    if (!roomSnap.exists()) {
      showToast("This room no longer exists", "error");
      currentRoomId = null;
      return;
    }

    const roomData = roomSnap.data() || {};
    isHost = roomData.createdBy === auth.currentUser.uid;

    await updateDoc(doc(db, 'liveRooms', roomId), {
      participantCount: increment(1),
      lastActivityAt: serverTimestamp()
    });

    const userTier = await getCurrentUserTier();
    myParticipantDocId = auth.currentUser.uid;

    await setDoc(
      doc(db, 'liveRooms', roomId, 'participants', auth.currentUser.uid),
      {
        uid: auth.currentUser.uid,
        displayName: auth.currentUser.displayName || 'Citizen',
        photoURL: auth.currentUser.photoURL || null,
        tier: userTier,
        joinedAt: serverTimestamp(),
        isSpeaking: false,
        isMuted: false,
        isHost: isHost,
        handRaised: false
      },
      { merge: true }
    );

    if (!alreadyInUrl) {
      history.pushState({}, '', `?room=${encodeURIComponent(roomId)}`);
    }

    // Defined in Part 2
    showActiveRoom(roomId, roomData);
  } catch (err) {
    console.error(err);
    currentRoomId = null;
    showToast("Could not join room", "error");
  }
};

// js/live-arena.js – World-Class Live Arena (Evidence-grade)
// Part 1: imports, lobby, create room, join room

import { listenToVerifiedCount, showToast } from './utils.js';
import { requireAuth } from './auth.js';
import { auth, db } from './firebase-config.js';
import { getCurrentUserTier, TIERS } from './tier.js';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  addDoc, doc, updateDoc, serverTimestamp, getDoc,
  deleteDoc, increment, getDocs, setDoc
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  Room,
  RoomEvent,
  Track,
  createLocalAudioTrack
} from 'https://cdn.jsdelivr.net/npm/livekit-client@2.5.0/dist/livekit-client.esm.mjs';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";

const GOAL = 500;

let roomsUnsubscribe = null;
let participantsUnsubscribe = null;
let currentRoomId = null;
let isSpeaking = false;
let livekitRoom = null;
let localAudioTrack = null;
let currentFilter = 'all';
let allRoomsCache = [];
let isHost = false;
let myParticipantDocId = null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------------------------
// Lobby boot
// ---------------------------------------------------------------------------
export function initLiveArena() {
  console.log('[LiveArena] World-class engine starting…');

  // Soft progress toward mega-stages
  listenToVerifiedCount((count) => {
    const countEl = document.getElementById('verifiedCount');
    const progressBar = document.getElementById('verifiedProgress');
    const progressText = document.getElementById('progressText');

    if (countEl) countEl.textContent = count.toLocaleString();
    if (progressBar) {
      const pct = Math.min((count / GOAL) * 100, 100);
      progressBar.style.width = `${pct}%`;
      progressBar.setAttribute('aria-valuenow', String(count));
    }
    if (progressText) {
      progressText.textContent = count >= GOAL
        ? "🎉 Full global stages unlocked!"
        : `${(GOAL - count).toLocaleString()} more citizens needed for mega-stages`;
    }
  });

  // Live rooms list
  if (roomsUnsubscribe) roomsUnsubscribe();
  const roomsQuery = query(
    collection(db, 'liveRooms'),
    where('isLive', '==', true),
    orderBy('participantCount', 'desc'),
    limit(80)
  );
  roomsUnsubscribe = onSnapshot(
    roomsQuery,
    (snap) => {
      allRoomsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      applyFilterAndRender();
    },
    (err) => {
      console.error('[LiveArena] rooms listener error:', err);
      const grid = document.getElementById('liveRoomsGrid');
      if (grid) {
        grid.innerHTML = `
          <div class="col-span-full py-16 text-center text-red-400">
            <p class="font-medium">Could not load live rooms</p>
            <p class="text-sm text-zinc-500 mt-1">Check connection or permissions, then refresh.</p>
          </div>`;
      }
    }
  );

  // Create room
  document.getElementById('createRoomBtn')?.addEventListener('click', createRoom);

  // Filters (including Protest / Weather / Election / General from HTML)
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter || 'all';
      document.querySelectorAll('[data-filter]').forEach(b => {
        b.classList.remove('bg-sky-500/20', 'text-sky-300', 'border-sky-500/40', 'border');
        b.classList.add('bg-zinc-800', 'text-zinc-400');
      });
      btn.classList.remove('bg-zinc-800', 'text-zinc-400');
      btn.classList.add('bg-sky-500/20', 'text-sky-300', 'border', 'border-sky-500/40');
      applyFilterAndRender();
    });
  });

  // Deep link: ?room=ROOM_ID
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');
  if (roomId) {
    joinLiveRoom(roomId, true);
  }

  // Cleanup on tab close
  window.addEventListener('beforeunload', () => {
    if (currentRoomId) leaveCurrentRoom(true);
  });
}

// ---------------------------------------------------------------------------
// Lobby list
// ---------------------------------------------------------------------------
function applyFilterAndRender() {
  let rooms = [...allRoomsCache];

  if (currentFilter === 'near') {
    rooms = rooms.filter(r => r.city);
  } else if (currentFilter === 'circle') {
    rooms = rooms.filter(r => r.tierRequired && r.tierRequired !== 'Open');
  } else if (currentFilter !== 'all') {
    const f = currentFilter.toLowerCase();
    rooms = rooms.filter(r =>
      (r.category || '').toLowerCase() === f ||
      (r.title || '').toLowerCase().includes(f) ||
      (r.description || '').toLowerCase().includes(f)
    );
  }

  renderRooms(rooms);
}

function renderRooms(rooms) {
  const grid = document.getElementById('liveRoomsGrid');
  if (!grid) return;

  if (!rooms.length) {
    grid.innerHTML = `
      <div class="col-span-full py-20 text-center text-zinc-500">
        <div class="text-6xl mb-5 opacity-70">🌍</div>
        <p class="text-xl font-medium text-zinc-300">No live rooms yet</p>
        <p class="text-sm mt-2 text-zinc-500">Be the first to open a stage for the world</p>
      </div>`;
    return;
  }

  grid.innerHTML = rooms.map(room => {
    const category = room.category || 'General';
    const speaking = room.speakingCount || 0;
    const reactions = room.reactions || {};
    const likes = reactions.like || 0;
    const claps = reactions.clap || 0;

    return `
    <div class="glass rounded-2xl border border-sky-500/20 p-5 hover:border-sky-400/50 hover:scale-[1.01] transition-all cursor-pointer group relative overflow-hidden"
         onclick="window.joinLiveRoom('${escapeHTML(room.id)}')"
         role="button"
         tabindex="0">
      <div class="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-sky-500/0 via-sky-500/60 to-sky-500/0 opacity-0 group-hover:opacity-100 transition"></div>

      <div class="flex justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="relative flex h-2.5 w-2.5">
            <span class="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
          </span>
          <span class="text-[11px] font-bold text-red-400 tracking-wide">LIVE</span>
          ${speaking > 0 ? `<span class="text-[11px] text-sky-400">${speaking} speaking</span>` : ''}
        </div>
        <span class="text-xs text-zinc-400 font-medium">${room.participantCount || 0} listening</span>
      </div>

      <h4 class="font-bold text-white text-lg group-hover:text-sky-300 line-clamp-2 leading-snug">${escapeHTML(room.title)}</h4>

      ${room.description ? `<p class="text-sm text-zinc-400 mt-1.5 line-clamp-2">${escapeHTML(room.description)}</p>` : ''}

      <div class="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500">
        ${claps ? `<span>👏 ${claps}</span>` : ''}
        ${likes ? `<span>👍 ${likes}</span>` : ''}
      </div>

      <div class="mt-4 flex items-center justify-between text-xs">
        <div class="flex items-center gap-2">
          <span class="text-zinc-500">${room.city ? '📍 ' + escapeHTML(room.city) : '🌐 Global'}</span>
          <span class="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-400">${escapeHTML(category)}</span>
        </div>
        <span class="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 font-medium">${escapeHTML(room.tierRequired || 'Open')}</span>
      </div>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Create room
// ---------------------------------------------------------------------------
async function createRoom() {
  if (!requireAuth("Sign in to start a room")) return;

  const title = prompt("Room title (e.g. Lagos Traffic – Happening Right Now)");
  if (!title || title.trim().length < 6) {
    showToast("Title too short (min 6 characters)", "warning");
    return;
  }
  const description = prompt("Short description (optional)") || "";
  const category =
    prompt("Category (Traffic, Safety, Protest, Weather, Election, General)") || "General";

  try {
    const userTier = await getCurrentUserTier();
    const roomRef = await addDoc(collection(db, 'liveRooms'), {
      title: title.trim().slice(0, 120),
      description: description.trim().slice(0, 300),
      category: category.trim().slice(0, 40),
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      isLive: true,
      participantCount: 1,
      speakingCount: 0,
      reactions: { clap: 0, fire: 0, like: 0, dislike: 0 },
      tierRequired: userTier === TIERS.CITIZEN ? 'Open' : userTier,
      lastActivityAt: serverTimestamp()
    });

    await setDoc(doc(db, 'liveRooms', roomRef.id, 'participants', auth.currentUser.uid), {
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || 'Citizen',
      photoURL: auth.currentUser.photoURL || null,
      tier: userTier,
      joinedAt: serverTimestamp(),
      isSpeaking: false,
      isMuted: false,
      isHost: true,
      handRaised: false
    });

    showToast("Room created – you are the host", "success");
    joinLiveRoom(roomRef.id);
  } catch (err) {
    console.error(err);
    showToast("Failed to create room", "error");
  }
}

// ---------------------------------------------------------------------------
// Join room
// ---------------------------------------------------------------------------
window.joinLiveRoom = async function (roomId, alreadyInUrl = false) {
  if (!requireAuth("Sign in to join")) return;
  if (!roomId || currentRoomId === roomId) return;

  try {
    if (currentRoomId) await leaveCurrentRoom(true);

    currentRoomId = roomId;

    const roomSnap = await getDoc(doc(db, 'liveRooms', roomId));
    if (!roomSnap.exists()) {
      showToast("This room no longer exists", "error");
      currentRoomId = null;
      return;
    }

    const roomData = roomSnap.data() || {};
    isHost = roomData.createdBy === auth.currentUser.uid;

    await updateDoc(doc(db, 'liveRooms', roomId), {
      participantCount: increment(1),
      lastActivityAt: serverTimestamp()
    });

    const userTier = await getCurrentUserTier();
    myParticipantDocId = auth.currentUser.uid;

    await setDoc(
      doc(db, 'liveRooms', roomId, 'participants', auth.currentUser.uid),
      {
        uid: auth.currentUser.uid,
        displayName: auth.currentUser.displayName || 'Citizen',
        photoURL: auth.currentUser.photoURL || null,
        tier: userTier,
        joinedAt: serverTimestamp(),
        isSpeaking: false,
        isMuted: false,
        isHost: isHost,
        handRaised: false
      },
      { merge: true }
    );

    if (!alreadyInUrl) {
      history.pushState({}, '', `?room=${encodeURIComponent(roomId)}`);
    }

    // Defined in Part 2
    showActiveRoom(roomId, roomData);
  } catch (err) {
    console.error(err);
    currentRoomId = null;
    showToast("Could not join room", "error");
  }
};
