// js/live-arena.js – World-Class Live Arena (Evidence-grade)

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
    const n = typeof count === 'number' && count >= 0 ? count : 0;
    const countEl = document.getElementById('verifiedCount');
    const progressBar = document.getElementById('verifiedProgress');
    const progressText = document.getElementById('progressText');

    if (countEl) countEl.textContent = n.toLocaleString();

    if (progressBar) {
      const pct = Math.min((n / GOAL) * 100, 100);
      progressBar.style.width = `${pct}%`;
      progressBar.setAttribute('aria-valuenow', String(n));
    }

    if (progressText) {
      progressText.textContent =
        n >= GOAL
          ? "🎉 Full global stages unlocked!"
          : n === 0
            ? "0 verified · be among the first 500"
            : `${(GOAL - n).toLocaleString()} more citizens needed for mega-stages`;
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


async function showActiveRoom(roomId, room = {}) {
  document.getElementById('lobbyView')?.classList.add('hidden');

  let stage = document.getElementById('activeRoomView');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = 'activeRoomView';
    document.body.appendChild(stage);
  }

  const reactions = room.reactions || {};

  stage.innerHTML = `
    <div class="fixed inset-0 z-50 bg-[#0a0f1c] flex flex-col">
      <!-- Top bar -->
      <div class="flex items-center justify-between px-3 sm:px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/70 backdrop-blur-xl gap-2">
        <div class="flex items-center gap-2 sm:gap-3 min-w-0">
          <button type="button" onclick="window.leaveCurrentRoom()"
                  class="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition shrink-0"
                  aria-label="Leave room">
            ←
          </button>
          <div class="min-w-0">
            <h2 class="font-bold text-white truncate text-base sm:text-lg">${escapeHTML(room.title || 'Live Room')}</h2>
            <p class="text-xs text-red-400 flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span class="relative flex h-2 w-2 shrink-0">
                <span class="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span class="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
              </span>
              LIVE • <span id="liveListenerCount">${room.participantCount || 1}</span> listening
              ${room.category ? `• ${escapeHTML(room.category)}` : ''}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 sm:gap-2 shrink-0 flex-wrap justify-end">
          <button id="corroborateBtn" type="button"
                  class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-xs sm:text-sm font-medium hover:bg-emerald-500/25 transition flex items-center gap-1.5">
            ✅ <span class="hidden sm:inline">I saw this</span>
            <span id="corroborationCount" class="bg-emerald-500/20 text-emerald-300 text-xs px-1.5 py-0.5 rounded-md font-bold">0</span>
          </button>
          <button id="sealBtn" type="button"
                  class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-xs sm:text-sm font-medium hover:bg-amber-500/25 transition">
            🛡️ Seal
          </button>
          <button id="dropEvidenceBtn" type="button"
                  class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-sky-500/15 text-sky-400 text-xs sm:text-sm font-medium hover:bg-sky-500/25 transition">
            📎 <span class="hidden sm:inline">Drop Evidence</span>
          </button>
          <button id="shareRoomBtnTop" type="button"
                  class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-300 text-xs sm:text-sm hover:bg-zinc-700 transition">
            🔗 Share
          </button>
          <button id="reportBtn" type="button"
                  class="px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-xs sm:text-sm hover:bg-zinc-700 transition">
            Report
          </button>
        </div>
      </div>

      <!-- Main stage -->
      <div class="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <div class="flex-1 p-4 lg:p-6 flex flex-col min-h-0">
          <div class="flex-1 flex items-center justify-center min-h-0 overflow-y-auto">
            <div id="speakersArea" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 w-full max-w-4xl">
              <div class="col-span-full text-center text-zinc-500 py-16">
                <div class="text-5xl mb-3 opacity-60">🎤</div>
                <p class="font-medium">No one is speaking yet</p>
                <p class="text-sm mt-1 text-zinc-600">Hold the mic to take the stage</p>
              </div>
            </div>
          </div>

          <div class="mt-4 flex flex-col items-center gap-3 pb-2 shrink-0">
            <button id="pushToTalkBtn" type="button"
                    class="w-24 h-24 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-white text-3xl shadow-2xl shadow-sky-500/30 active:scale-95 transition-all flex items-center justify-center select-none"
                    aria-label="Hold to speak">
              🎤
            </button>
            <p class="text-sm text-zinc-400" id="talkStatus">Hold to speak • Release to stop</p>

            <div class="flex flex-wrap justify-center gap-2 mt-1">
              <button id="raiseHandBtn" type="button"
                      class="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition">
                ✋ Raise Hand
              </button>
              <button type="button" data-reaction="clap" class="room-react-btn px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition" title="Clap">👏</button>
              <button type="button" data-reaction="fire" class="room-react-btn px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition" title="Fire">🔥</button>
              <button type="button" data-reaction="like" class="room-react-btn px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition" title="Agree">👍</button>
              <button type="button" data-reaction="dislike" class="room-react-btn px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition" title="Disagree">👎</button>
              <button type="button" id="shareRoomBtn"
                      class="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition" title="Share room">
                🔗 Share
              </button>
            </div>

            <div id="liveReactionCounts" class="flex flex-wrap justify-center gap-3 text-xs text-zinc-400 mt-0.5">
              <span>👏 <b id="count-clap">${reactions.clap || 0}</b></span>
              <span>🔥 <b id="count-fire">${reactions.fire || 0}</b></span>
              <span>👍 <b id="count-like">${reactions.like || 0}</b></span>
              <span>👎 <b id="count-dislike">${reactions.dislike || 0}</b></span>
            </div>

            <div id="hostControls" class="hidden mt-2 flex flex-wrap justify-center gap-2">
              <button id="muteAllBtn" type="button" class="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm hover:bg-zinc-700">🔇 Mute All</button>
              <button id="lowerHandsBtn" type="button" class="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm hover:bg-zinc-700">✋ Lower All Hands</button>
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-zinc-800 bg-zinc-900/40 flex flex-col max-h-[40vh] lg:max-h-none">
          <div class="p-4 border-b border-zinc-800 font-medium text-sm text-zinc-300 flex justify-between">
            <span>In this room</span>
            <span id="sidebarCount" class="text-zinc-500">0</span>
          </div>
          <div id="participantsList" class="flex-1 overflow-y-auto p-3 space-y-1.5"></div>
        </div>
      </div>
    </div>

    <!-- Drop Evidence Modal -->
    <div id="dropEvidenceModal" class="hidden fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/70 p-4">
      <div class="w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-700 p-5 shadow-2xl">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-lg font-bold text-white">📎 Drop Evidence</h3>
          <button id="closeDropEvidenceBtn" type="button" class="text-zinc-400 hover:text-white text-xl" aria-label="Close">✕</button>
        </div>

        <textarea id="dropEvidenceNote" rows="3" maxlength="500"
          placeholder="What are you witnessing right now? (optional note)"
          class="w-full rounded-xl border border-zinc-700 bg-zinc-800 p-3 text-sm text-white placeholder-zinc-500 focus:border-sky-500 focus:outline-none mb-3"></textarea>

        <div class="flex gap-2 mb-4">
          <label class="flex-1 cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-center text-sm text-zinc-300 hover:border-sky-500 hover:text-sky-300 transition">
            📷 Photo
            <input type="file" id="dropEvidencePhoto" accept="image/*" class="hidden">
          </label>
          <label class="flex-1 cursor-pointer rounded-xl border border-zinc-700 bg-zinc-800 py-3 text-center text-sm text-zinc-300 hover:border-sky-500 hover:text-sky-300 transition">
            🎤 Audio
            <input type="file" id="dropEvidenceAudio" accept="audio/*" class="hidden">
          </label>
        </div>

        <p id="dropEvidenceFileName" class="text-xs text-zinc-500 mb-3 min-h-[1rem]"></p>

        <button id="confirmDropEvidenceBtn" type="button"
          class="w-full rounded-xl bg-sky-500 py-3 text-sm font-bold text-black hover:bg-sky-400 active:scale-[0.98] transition">
          🛡️ Seal & Drop Evidence
        </button>
      </div>
    </div>
  `;

  stage.classList.remove('hidden');

  if (isHost) {
    document.getElementById('hostControls')?.classList.remove('hidden');
  }

  // Wire controls (LiveKit, reactions, share, report, etc.) — Part 3
  wireActiveRoomControls(roomId);

  // Drop evidence modal (local to this room view)
  wireDropEvidenceModal(roomId);

  // Participants live list
  if (participantsUnsubscribe) participantsUnsubscribe();
  participantsUnsubscribe = onSnapshot(
    collection(db, 'liveRooms', roomId, 'participants'),
    (snap) => {
      const participants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderParticipants(participants);
      const count = participants.length;
      const liveCount = document.getElementById('liveListenerCount');
      const sideCount = document.getElementById('sidebarCount');
      if (liveCount) liveCount.textContent = count;
      if (sideCount) sideCount.textContent = count;
    },
    (err) => console.error('[LiveArena] participants error:', err)
  );

  // Corroboration count
  if (window._corrUnsub) {
    try { window._corrUnsub(); } catch (_) {}
  }
  window._corrUnsub = onSnapshot(
    collection(db, 'liveRooms', roomId, 'corroborations'),
    (snap) => {
      const el = document.getElementById('corroborationCount');
      if (el) {
        el.textContent = snap.size;
        if (snap.size > 0) {
          el.classList.add('animate-pulse');
          setTimeout(() => el.classList.remove('animate-pulse'), 800);
        }
      }
    }
  );

  // Live reaction totals on room doc
  if (window._reactUnsub) {
    try { window._reactUnsub(); } catch (_) {}
  }
  window._reactUnsub = onSnapshot(
    doc(db, 'liveRooms', roomId),
    (snap) => {
      const r = snap.data()?.reactions || {};
      ['clap', 'fire', 'like', 'dislike'].forEach((k) => {
        const el = document.getElementById(`count-${k}`);
        if (el) el.textContent = r[k] || 0;
      });
    }
  );
}

// ---------------------------------------------------------------------------
// Participants + speakers stage
// ---------------------------------------------------------------------------
function renderParticipants(participants) {
  const list = document.getElementById('participantsList');
  const speakersArea = document.getElementById('speakersArea');
  if (!list || !speakersArea) return;

  list.innerHTML = participants.map(p => {
    const isMe = p.uid === auth.currentUser?.uid;
    const showHostActions = isHost && !isMe;
    const uidSafe = escapeHTML(p.uid || p.id || '');

    return `
    <div class="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-800/60 transition group">
      <div class="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold overflow-hidden shrink-0">
        ${p.photoURL
          ? `<img src="${escapeHTML(p.photoURL)}" class="w-full h-full object-cover" alt="">`
          : escapeHTML((p.displayName || '?')[0] || '?')}
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate flex items-center gap-1.5">
          ${escapeHTML(p.displayName || 'Citizen')}
          ${p.isHost ? '<span class="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">HOST</span>' : ''}
          ${isMe ? '<span class="text-[10px] text-zinc-500">(you)</span>' : ''}
        </div>
        <div class="text-[11px] text-zinc-500">${escapeHTML(p.tier || 'citizen')}</div>
      </div>

      ${p.handRaised ? '<span class="text-amber-400 text-sm">✋</span>' : ''}
      ${p.isSpeaking ? '<span class="text-sky-400 text-xs font-medium">Speaking</span>' : ''}

      ${showHostActions ? `
        <div class="hidden group-hover:flex gap-1">
          <button type="button" onclick="window.hostAction('${uidSafe}', 'mute')" class="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600">Mute</button>
          <button type="button" onclick="window.hostAction('${uidSafe}', 'promote')" class="text-xs px-2 py-1 rounded bg-sky-600/30 hover:bg-sky-600/50 text-sky-300">Promote</button>
          <button type="button" onclick="window.hostAction('${uidSafe}', 'remove')" class="text-xs px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400">Remove</button>
        </div>
      ` : ''}
    </div>`;
  }).join('');

  const speakers = participants.filter(p => p.isSpeaking);
  if (speakers.length === 0) {
    speakersArea.innerHTML = `
      <div class="col-span-full text-center text-zinc-500 py-16">
        <div class="text-5xl mb-3 opacity-60">🎤</div>
        <p class="font-medium">No one is speaking yet</p>
        <p class="text-sm mt-1 text-zinc-600">Hold the mic to take the stage</p>
      </div>`;
  } else {
    speakersArea.innerHTML = speakers.map(s => `
      <div class="flex flex-col items-center p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30 stage-glow">
        <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-zinc-700 flex items-center justify-center text-xl font-bold mb-2 overflow-hidden speaking-ring">
          ${s.photoURL
            ? `<img src="${escapeHTML(s.photoURL)}" class="w-full h-full object-cover" alt="">`
            : escapeHTML((s.displayName || '?')[0] || '?')}
        </div>
        <div class="font-medium text-sm text-center truncate w-full">${escapeHTML(s.displayName || 'Citizen')}</div>
        <div class="text-xs text-sky-400 mt-1 font-medium">Speaking</div>
        ${s.isHost ? '<div class="text-[10px] text-amber-400 mt-0.5">HOST</div>' : ''}
      </div>
    `).join('');
  }
}

// ---------------------------------------------------------------------------
// Drop evidence modal (photo / audio + seal into room + testimonies)
// ---------------------------------------------------------------------------
function wireDropEvidenceModal(roomId) {
  const dropModal = document.getElementById('dropEvidenceModal');
  const dropBtn = document.getElementById('dropEvidenceBtn');
  const closeDropBtn = document.getElementById('closeDropEvidenceBtn');
  const confirmDropBtn = document.getElementById('confirmDropEvidenceBtn');
  const noteInput = document.getElementById('dropEvidenceNote');
  const photoInput = document.getElementById('dropEvidencePhoto');
  const audioInput = document.getElementById('dropEvidenceAudio');
  const fileNameEl = document.getElementById('dropEvidenceFileName');

  let selectedDropFile = null;

  dropBtn?.addEventListener('click', () => {
    if (!requireAuth("Sign in to drop evidence")) return;
    dropModal?.classList.remove('hidden');
  });

  closeDropBtn?.addEventListener('click', () => {
    dropModal?.classList.add('hidden');
    selectedDropFile = null;
    if (noteInput) noteInput.value = '';
    if (fileNameEl) fileNameEl.textContent = '';
    if (photoInput) photoInput.value = '';
    if (audioInput) audioInput.value = '';
  });

  photoInput?.addEventListener('change', (e) => {
    selectedDropFile = e.target.files?.[0] || null;
    if (fileNameEl) fileNameEl.textContent = selectedDropFile ? `📷 ${selectedDropFile.name}` : '';
    if (audioInput) audioInput.value = '';
  });

  audioInput?.addEventListener('change', (e) => {
    selectedDropFile = e.target.files?.[0] || null;
    if (fileNameEl) fileNameEl.textContent = selectedDropFile ? `🎤 ${selectedDropFile.name}` : '';
    if (photoInput) photoInput.value = '';
  });

  confirmDropBtn?.addEventListener('click', async () => {
    if (!requireAuth()) return;

    const note = (noteInput?.value || '').trim();
    if (!note && !selectedDropFile) {
      showToast("Add a note or attach a photo/audio", "warning");
      return;
    }

    confirmDropBtn.disabled = true;
    confirmDropBtn.textContent = "Sealing…";

    try {
      let mediaUrl = null;
      let mediaType = null;
      let mediaHash = null;

      if (selectedDropFile) {
        const { uploadEvidenceMedia } = await import('./storage.js');
        const { computeSHA256 } = await import('./utils.js');

        mediaHash = await computeSHA256(selectedDropFile);
        mediaType = selectedDropFile.type.startsWith('audio/') ? 'audio' : 'image';
        mediaUrl = await uploadEvidenceMedia(selectedDropFile, mediaType);
      }

      await addDoc(collection(db, 'liveRooms', roomId, 'evidenceDrops'), {
        droppedBy: auth.currentUser.uid,
        displayName: auth.currentUser.displayName || 'Citizen',
        note: note || null,
        mediaUrl,
        mediaType,
        mediaHash,
        roomId,
        createdAt: serverTimestamp()
      });

      await addDoc(collection(db, 'testimonies'), {
        content: note || `Live evidence dropped from room: ${roomId}`,
        title: 'Live Evidence – Arena',
        channel: 'witness-voice',
        targetFeed: 'witness_voice',
        visibility: 'public',
        authorId: auth.currentUser.uid,
        author: auth.currentUser.displayName || 'Citizen',
        isAnonymous: false,
        imageUrl: mediaType === 'image' ? mediaUrl : null,
        audioUrl: mediaType === 'audio' ? mediaUrl : null,
        imageHash: mediaType === 'image' ? mediaHash : null,
        audioHash: mediaType === 'audio' ? mediaHash : null,
        forensicHash: mediaHash,
        liveRoomId: roomId,
        source: 'live-arena',
        createdAt: serverTimestamp(),
        status: 'published'
      });

      showToast("🛡️ Evidence sealed and dropped", "success");
      dropModal?.classList.add('hidden');
      selectedDropFile = null;
      if (noteInput) noteInput.value = '';
      if (fileNameEl) fileNameEl.textContent = '';
      if (photoInput) photoInput.value = '';
      if (audioInput) audioInput.value = '';
    } catch (err) {
      console.error('[Drop Evidence]', err);
      showToast("Failed to drop evidence", "error");
    } finally {
      confirmDropBtn.disabled = false;
      confirmDropBtn.textContent = "🛡️ Seal & Drop Evidence";
    }
  });
}

// ========== LIVEKIT ==========
async function connectToLiveKit(roomId) {
  try {
    // Tear down any previous session
    if (livekitRoom) {
      try { await livekitRoom.disconnect(); } catch (_) {}
      livekitRoom = null;
    }

    const functions = getFunctions();
    const getToken = httpsCallable(functions, 'getLiveKitToken');

    const result = await getToken({
      roomName: roomId,
      participantName: auth.currentUser?.displayName || 'Citizen'
    });

    const { token, url } = result.data || {};
    if (!token || !url) {
      throw new Error('Missing LiveKit token or URL from server');
    }

    livekitRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    livekitRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const audioEl = track.attach();
        audioEl.id = `audio-${participant.identity}`;
        audioEl.autoplay = true;
        document.body.appendChild(audioEl);
      }
    });

    livekitRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach(el => el.remove());
    });

    livekitRoom.on(RoomEvent.Disconnected, () => {
      console.log('[LiveKit] disconnected');
    });

    await livekitRoom.connect(url, token);
    console.log('Connected to LiveKit:', roomId);
    showToast("Voice connected – ready to speak", "success");
  } catch (err) {
    console.error('LiveKit connect error:', err);
    showToast("Could not connect voice channel (check LiveKit secrets / token)", "error");
  }
}

async function startSpeaking() {
  if (!livekitRoom || isSpeaking) return;

  if (livekitRoom.state !== 'connected') {
    showToast("Voice channel not ready yet – wait a moment", "warning");
    return;
  }

  try {
    localAudioTrack = await createLocalAudioTrack({
      name: 'microphone',
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    });
    await livekitRoom.localParticipant.publishTrack(localAudioTrack);

    isSpeaking = true;

    if (myParticipantDocId && currentRoomId) {
      await updateDoc(doc(db, 'liveRooms', currentRoomId, 'participants', myParticipantDocId), {
        isSpeaking: true
      });
      await updateDoc(doc(db, 'liveRooms', currentRoomId), {
        speakingCount: increment(1),
        lastActivityAt: serverTimestamp()
      });
    }

    const talkBtn = document.getElementById('pushToTalkBtn');
    const status = document.getElementById('talkStatus');
    if (talkBtn) {
      talkBtn.classList.add('ring-4', 'ring-red-500', 'scale-110', 'shadow-red-500/40', 'ptt-live');
    }
    if (status) {
      status.textContent = "🔴 YOU ARE LIVE – Speak clearly";
      status.classList.add('text-red-400');
    }
  } catch (err) {
    console.error('Failed to start speaking:', err);
    showToast("Microphone access denied or failed", "error");
    try {
      if (localAudioTrack) {
        localAudioTrack.stop();
        localAudioTrack = null;
      }
    } catch (_) {}
    isSpeaking = false;
  }
}

async function stopSpeaking() {
  if (!isSpeaking) return;

  try {
    if (localAudioTrack && livekitRoom) {
      await livekitRoom.localParticipant.unpublishTrack(localAudioTrack);
      localAudioTrack.stop();
    }
  } catch (e) {
    console.warn('stopSpeaking cleanup:', e);
  }

  localAudioTrack = null;
  isSpeaking = false;

  if (myParticipantDocId && currentRoomId) {
    try {
      await updateDoc(doc(db, 'liveRooms', currentRoomId, 'participants', myParticipantDocId), {
        isSpeaking: false
      });
      await updateDoc(doc(db, 'liveRooms', currentRoomId), {
        speakingCount: increment(-1),
        lastActivityAt: serverTimestamp()
      });
    } catch (e) {
      console.warn(e);
    }
  }

  const talkBtn = document.getElementById('pushToTalkBtn');
  const status = document.getElementById('talkStatus');
  if (talkBtn) {
    talkBtn.classList.remove('ring-4', 'ring-red-500', 'scale-110', 'shadow-red-500/40', 'ptt-live');
  }
  if (status) {
    status.textContent = "Hold to speak • Release to stop";
    status.classList.remove('text-red-400');
  }
}

// ========== WIRE ALL IN-ROOM CONTROLS ==========
function wireActiveRoomControls(roomId) {
  connectToLiveKit(roomId);

  // Push-to-talk
  const talkBtn = document.getElementById('pushToTalkBtn');
  if (talkBtn) {
    talkBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startSpeaking();
    });
    talkBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startSpeaking();
    }, { passive: false });
    talkBtn.addEventListener('mouseup', stopSpeaking);
    talkBtn.addEventListener('mouseleave', stopSpeaking);
    talkBtn.addEventListener('touchend', stopSpeaking);
    talkBtn.addEventListener('touchcancel', stopSpeaking);
  }

  // Raise hand
  document.getElementById('raiseHandBtn')?.addEventListener('click', async () => {
    if (!myParticipantDocId || !currentRoomId) return;
    try {
      const ref = doc(db, 'liveRooms', currentRoomId, 'participants', myParticipantDocId);
      const snap = await getDoc(ref);
      const currentlyRaised = snap.data()?.handRaised || false;
      await updateDoc(ref, { handRaised: !currentlyRaised });
      showToast(currentlyRaised ? "Hand lowered" : "Hand raised – waiting for host", "info");
    } catch (err) {
      console.error(err);
      showToast("Could not update hand", "error");
    }
  });

  // Live reactions: 👏 🔥 👍 👎
  document.querySelectorAll('.room-react-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!requireAuth("Sign in to react")) return;
      const type = btn.dataset.reaction;
      if (!type) return;

      try {
        await updateDoc(doc(db, 'liveRooms', roomId), {
          [`reactions.${type}`]: increment(1),
          lastActivityAt: serverTimestamp()
        });
        spawnFloatingReaction(btn.textContent.trim());
      } catch (err) {
        console.error(err);
        showToast("Could not send reaction", "error");
      }
    });
  });

  // Share (bottom + top bar)
  const shareHandler = async () => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${encodeURIComponent(roomId)}`;
    const title =
      document.querySelector('#activeRoomView h2')?.textContent?.trim() ||
      'Live Arena – VocalWitness';
    const text = `I'm in a live witness room on VocalWitness: ${title}`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch (_) {
        /* cancelled → menu */
      }
    }
    openRoomShareMenu(shareUrl, title, text);
  };

  document.getElementById('shareRoomBtn')?.addEventListener('click', shareHandler);
  document.getElementById('shareRoomBtnTop')?.addEventListener('click', shareHandler);

  // Report room
  document.getElementById('reportBtn')?.addEventListener('click', async () => {
    if (!requireAuth("Sign in to report")) return;
    const reason = prompt(
      "Why are you reporting this room? (spam, harassment, false claims, other)"
    );
    if (!reason || reason.trim().length < 3) return;

    try {
      await addDoc(collection(db, 'liveRooms', roomId, 'reports'), {
        reportedBy: auth.currentUser.uid,
        displayName: auth.currentUser.displayName || 'Citizen',
        reason: reason.trim().slice(0, 500),
        createdAt: serverTimestamp()
      });
      showToast("Report submitted to stewards", "success");
    } catch (err) {
      console.error(err);
      showToast("Could not submit report (check Firestore rules)", "error");
    }
  });

  // Corroborate
  document.getElementById('corroborateBtn')?.addEventListener('click', async () => {
    if (!requireAuth()) return;

    try {
      const corrRef = doc(db, 'liveRooms', roomId, 'corroborations', auth.currentUser.uid);
      const existing = await getDoc(corrRef);

      if (existing.exists()) {
        showToast("You already corroborated this room", "info");
        return;
      }

      await setDoc(corrRef, {
        uid: auth.currentUser.uid,
        displayName: auth.currentUser.displayName || 'Citizen',
        createdAt: serverTimestamp()
      });

      showToast("✅ Corroboration recorded – strengthens the evidence", "success");
    } catch (err) {
      console.error(err);
      showToast("Could not record corroboration", "error");
    }
  });

  // Seal segment
  document.getElementById('sealBtn')?.addEventListener('click', async () => {
    if (!requireAuth()) return;
    try {
      await addDoc(collection(db, 'liveRooms', roomId, 'sealedSegments'), {
        sealedBy: auth.currentUser.uid,
        displayName: auth.currentUser.displayName || 'Citizen',
        sealedAt: serverTimestamp(),
        note: 'Segment sealed for public record',
        participantCount: document.getElementById('liveListenerCount')?.textContent || 0
      });
      showToast("🛡️ Segment sealed – now part of the public evidence ledger", "success");
    } catch (err) {
      console.error(err);
      showToast("Could not seal segment", "error");
    }
  });

  // Host: mute all
  document.getElementById('muteAllBtn')?.addEventListener('click', async () => {
    if (!isHost) return;
    try {
      const snap = await getDocs(collection(db, 'liveRooms', roomId, 'participants'));
      const ops = [];
      snap.forEach(d => {
        if (d.id !== auth.currentUser.uid) {
          ops.push(updateDoc(d.ref, { isSpeaking: false, handRaised: false }));
        }
      });
      await Promise.all(ops);
      showToast("All participants muted", "info");
    } catch (err) {
      console.error(err);
      showToast("Mute all failed", "error");
    }
  });

  // Host: lower all hands
  document.getElementById('lowerHandsBtn')?.addEventListener('click', async () => {
    if (!isHost) return;
    try {
      const snap = await getDocs(collection(db, 'liveRooms', roomId, 'participants'));
      const ops = [];
      snap.forEach(d => {
        ops.push(updateDoc(d.ref, { handRaised: false }));
      });
      await Promise.all(ops);
      showToast("All hands lowered", "info");
    } catch (err) {
      console.error(err);
      showToast("Could not lower hands", "error");
    }
  });
}

// ========== HOST ACTIONS ==========
window.hostAction = async function (uid, action) {
  if (!isHost || !currentRoomId || !uid) return;

  const ref = doc(db, 'liveRooms', currentRoomId, 'participants', uid);

  try {
    if (action === 'mute') {
      await updateDoc(ref, { isSpeaking: false, handRaised: false });
      showToast("Participant muted", "info");
    } else if (action === 'promote') {
      // Soft promote: clear mute flags / lower hand so they can speak
      await updateDoc(ref, { isMuted: false, handRaised: false });
      showToast("Participant promoted to speak", "success");
    } else if (action === 'remove') {
      await deleteDoc(ref);
      await updateDoc(doc(db, 'liveRooms', currentRoomId), {
        participantCount: increment(-1),
        lastActivityAt: serverTimestamp()
      });
      showToast("Participant removed", "info");
    }
  } catch (err) {
    console.error(err);
    showToast("Action failed (permissions?)", "error");
  }
};

// ========== LEAVE ROOM ==========
window.leaveCurrentRoom = async function (silent = false) {
  const leavingId = currentRoomId;

  try {
    if (isSpeaking) await stopSpeaking();
  } catch (_) {}

  if (livekitRoom) {
    try { await livekitRoom.disconnect(); } catch (_) {}
    livekitRoom = null;
  }
  if (localAudioTrack) {
    try { localAudioTrack.stop(); } catch (_) {}
    localAudioTrack = null;
  }
  isSpeaking = false;

  // Remove stray remote audio elements
  document.querySelectorAll('[id^="audio-"]').forEach(el => el.remove());

  if (participantsUnsubscribe) {
    try { participantsUnsubscribe(); } catch (_) {}
    participantsUnsubscribe = null;
  }
  if (window._corrUnsub) {
    try { window._corrUnsub(); } catch (_) {}
    window._corrUnsub = null;
  }
  if (window._reactUnsub) {
    try { window._reactUnsub(); } catch (_) {}
    window._reactUnsub = null;
  }

  if (leavingId && auth.currentUser) {
    try {
      await deleteDoc(doc(db, 'liveRooms', leavingId, 'participants', auth.currentUser.uid));
      await updateDoc(doc(db, 'liveRooms', leavingId), {
        participantCount: increment(-1),
        lastActivityAt: serverTimestamp()
      });
    } catch (e) {
      console.warn('leave cleanup:', e);
    }
  }

  currentRoomId = null;
  myParticipantDocId = null;
  isHost = false;

  document.getElementById('activeRoomView')?.classList.add('hidden');
  const active = document.getElementById('activeRoomView');
  if (active) active.innerHTML = '';

  document.getElementById('lobbyView')?.classList.remove('hidden');
  history.pushState({}, '', window.location.pathname);

  if (!silent) showToast("Left the room", "info");
};

// ========== SHARE + FLOATING REACTIONS ==========
function spawnFloatingReaction(emoji) {
  const el = document.createElement('div');
  el.textContent = emoji;
  el.className = 'vw-float-react';
  el.style.left = `${35 + Math.random() * 30}%`;
  el.style.bottom = '18%';
  el.style.opacity = '1';
  el.style.transform = 'translateY(0)';
  document.body.appendChild(el);
  requestAnimationFrame(() => {
    el.style.transform = 'translateY(-140px)';
    el.style.opacity = '0';
  });
  setTimeout(() => el.remove(), 1100);
}

function openRoomShareMenu(shareUrl, title, text) {
  document.getElementById('vw-room-share-menu')?.remove();

  const menu = document.createElement('div');
  menu.id = 'vw-room-share-menu';
  menu.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4';

  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedText = encodeURIComponent(text);

  menu.innerHTML = `
    <div class="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 shadow-2xl">
      <div class="mb-4 flex items-center justify-between">
        <h3 class="text-base font-semibold text-white">Share this live room</h3>
        <button type="button" data-share-close class="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-white">✕</button>
      </div>
      <div class="grid grid-cols-2 gap-3">
        <button type="button" data-share="copy"
                class="rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-sky-500/50 transition">
          🔗 Copy link
        </button>
        <button type="button" data-share="whatsapp"
                class="rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-sky-500/50 transition">
          💬 WhatsApp
        </button>
        <button type="button" data-share="twitter"
                class="rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-sky-500/50 transition">
          𝕏 Twitter / X
        </button>
        <button type="button" data-share="telegram"
                class="rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-sky-500/50 transition">
          ✈️ Telegram
        </button>
        <button type="button" data-share="facebook"
                class="rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-sky-500/50 transition">
          📘 Facebook
        </button>
        <button type="button" data-share="linkedin"
                class="rounded-xl border border-zinc-700 bg-zinc-800/80 px-3 py-4 text-sm text-zinc-200 hover:border-sky-500/50 transition">
          💼 LinkedIn
        </button>
      </div>
      <p class="mt-4 truncate rounded-lg bg-zinc-950 px-3 py-2 text-xs text-zinc-500" title="${escapeHTML(shareUrl)}">
        ${escapeHTML(shareUrl)}
      </p>
    </div>
  `;

  document.body.appendChild(menu);

  menu.addEventListener('click', (e) => {
    if (e.target === menu || e.target.closest('[data-share-close]')) {
      menu.remove();
    }
  });

  menu.querySelectorAll('[data-share]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.getAttribute('data-share');
      menu.remove();

      if (type === 'copy') {
        try {
          await navigator.clipboard.writeText(shareUrl);
          showToast('Room link copied', 'success');
        } catch {
          showToast('Could not copy link', 'error');
        }
        return;
      }

      const urls = {
        whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
        twitter: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
        telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
      };

      if (urls[type]) {
        window.open(urls[type], '_blank', 'noopener,noreferrer');
      }
    });
  });
}
