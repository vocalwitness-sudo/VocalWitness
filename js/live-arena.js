// js/live-arena.js – Full Live Arena + Active Room Stage with LiveKit WebRTC
import { listenToVerifiedCount, showToast } from './utils.js';
import { requireAuth } from './auth.js';
import { auth, db } from './firebase-config.js';
import { getCurrentUserTier, TIERS } from './tier.js';
import {
  collection, query, where, orderBy, limit, onSnapshot,
  addDoc, doc, updateDoc, serverTimestamp, getDoc,
  deleteDoc, increment, getDocs
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { Room, RoomEvent, Track } from 'https://cdn.jsdelivr.net/npm/livekit-client@2.5.0/dist/livekit-client.esm.mjs';
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-functions.js";

const GOAL = 500;
let roomsUnsubscribe = null;
let participantsUnsubscribe = null;
let currentRoomId = null;
let isSpeaking = false;
let livekitRoom = null;
let localAudioTrack = null;

export function initLiveArena() {
  console.log('[LiveArena] Full engine + Active Room starting…');

  // Soft progress
  listenToVerifiedCount((count) => {
    const countEl = document.getElementById('verifiedCount');
    const progressBar = document.getElementById('verifiedProgress');
    const progressText = document.getElementById('progressText');

    if (countEl) countEl.textContent = count.toLocaleString();
    if (progressBar) {
      progressBar.style.width = `${Math.min((count / GOAL) * 100, 100)}%`;
    }
    if (progressText) {
      progressText.textContent = count >= GOAL
        ? "🎉 Full global stages unlocked!"
        : `${(GOAL - count).toLocaleString()} more citizens needed for mega-stages`;
    }
  });

  // Rooms list
  if (roomsUnsubscribe) roomsUnsubscribe();
  const roomsQuery = query(
    collection(db, 'liveRooms'),
    where('isLive', '==', true),
    orderBy('participantCount', 'desc'),
    limit(60)
  );
  roomsUnsubscribe = onSnapshot(roomsQuery, (snap) => {
    renderRooms(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });

  // Create button
  document.getElementById('createRoomBtn')?.addEventListener('click', createRoom);

  // Check if we landed on a specific room
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');
  if (roomId) {
    joinLiveRoom(roomId, true); // true = already in URL
  }
}

function renderRooms(rooms) {
  const grid = document.getElementById('liveRoomsGrid');
  if (!grid) return;

  if (!rooms.length) {
    grid.innerHTML = `
      <div class="col-span-full py-20 text-center text-zinc-500">
        <div class="text-6xl mb-5">🌍</div>
        <p class="text-xl font-medium text-zinc-300">No live rooms yet</p>
        <p class="text-sm mt-2">Be the first to open a stage for the world</p>
      </div>`;
    return;
  }

  grid.innerHTML = rooms.map(room => `
    <div class="glass rounded-2xl border border-sky-500/25 p-5 hover:border-sky-400/50 transition cursor-pointer group"
         onclick="window.joinLiveRoom('${room.id}')">
      <div class="flex justify-between mb-3">
        <div class="flex items-center gap-2">
          <span class="relative flex h-2.5 w-2.5">
            <span class="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span class="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500"></span>
          </span>
          <span class="text-[11px] font-bold text-red-400">LIVE</span>
        </div>
        <span class="text-xs text-zinc-400">${room.participantCount || 0} listening</span>
      </div>
      <h4 class="font-bold text-white text-lg group-hover:text-sky-300 line-clamp-2">${escapeHTML(room.title)}</h4>
      ${room.description ? `<p class="text-sm text-zinc-400 mt-1 line-clamp-2">${escapeHTML(room.description)}</p>` : ''}
      <div class="mt-4 flex justify-between text-xs">
        <span class="text-zinc-500">${room.city ? '📍 ' + escapeHTML(room.city) : '🌐 Global'}</span>
        <span class="px-2 py-0.5 rounded bg-sky-500/10 text-sky-400">${escapeHTML(room.tierRequired || 'Open')}</span>
      </div>
    </div>
  `).join('');
}

async function createRoom() {
  if (!requireAuth("Sign in to start a room")) return;

  const title = prompt("Room title (e.g. Lagos Traffic – Happening Right Now)");
  if (!title || title.trim().length < 6) {
    showToast("Title too short", "warning");
    return;
  }
  const description = prompt("Short description (optional)") || "";

  try {
    const userTier = await getCurrentUserTier();
    const roomRef = await addDoc(collection(db, 'liveRooms'), {
      title: title.trim().slice(0, 120),
      description: description.trim().slice(0, 300),
      createdBy: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      isLive: true,
      participantCount: 1,
      tierRequired: userTier === TIERS.CITIZEN ? 'Open' : userTier,
      lastActivityAt: serverTimestamp()
    });

    await addDoc(collection(db, 'liveRooms', roomRef.id, 'participants'), {
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || 'Citizen',
      tier: userTier,
      joinedAt: serverTimestamp(),
      isSpeaking: false,
      isMuted: false
    });

    showToast("Room created!", "success");
    joinLiveRoom(roomRef.id);
  } catch (err) {
    console.error(err);
    showToast("Failed to create room", "error");
  }
}

window.joinLiveRoom = async function (roomId, alreadyInUrl = false) {
  if (!requireAuth("Sign in to join")) return;
  if (currentRoomId === roomId) return;

  try {
    // Leave previous room cleanly
    if (currentRoomId) await leaveCurrentRoom();

    currentRoomId = roomId;

    // Increment count & add participant
    await updateDoc(doc(db, 'liveRooms', roomId), {
      participantCount: increment(1),
      lastActivityAt: serverTimestamp()
    });

    const userTier = await getCurrentUserTier();
    await addDoc(collection(db, 'liveRooms', roomId, 'participants'), {
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || 'Citizen',
      photoURL: auth.currentUser.photoURL || null,
      tier: userTier,
      joinedAt: serverTimestamp(),
      isSpeaking: false,
      isMuted: false
    });

    if (!alreadyInUrl) {
      history.pushState({}, '', `?room=${roomId}`);
    }

    showActiveRoom(roomId);
  } catch (err) {
    console.error(err);
    showToast("Could not join room", "error");
  }
};

async function showActiveRoom(roomId) {
  // Hide lobby
  document.getElementById('lobbyView')?.classList.add('hidden');
  
  // Show active room container
  let stage = document.getElementById('activeRoomView');
  if (!stage) {
    stage = document.createElement('div');
    stage.id = 'activeRoomView';
    document.body.appendChild(stage);
  }

  // Fetch room data
  const roomSnap = await getDoc(doc(db, 'liveRooms', roomId));
  const room = roomSnap.data() || {};

  stage.innerHTML = `
    <div class="fixed inset-0 z-50 bg-[#0a0f1c] flex flex-col">
      <!-- Top bar -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800 bg-zinc-900/80 backdrop-blur">
        <div class="flex items-center gap-3 min-w-0">
          <button onclick="window.leaveCurrentRoom()" class="p-2 rounded-xl bg-zinc-800 hover:bg-zinc-700">
            ← Leave
          </button>
          <div class="min-w-0">
            <h2 class="font-bold text-white truncate">${escapeHTML(room.title || 'Live Room')}</h2>
            <p class="text-xs text-red-400 flex items-center gap-1">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span class="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
              </span>
              LIVE • <span id="liveListenerCount">${room.participantCount || 1}</span> listening
            </p>
          </div>
        </div>
        <div class="flex gap-2">
          <button id="corroborateBtn" class="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-medium">
            ✅ I saw this
          </button>
          <button id="reportBtn" class="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-sm">Report</button>
        </div>
      </div>

      <!-- Main stage -->
      <div class="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <!-- Speakers / Stage -->
        <div class="flex-1 p-4 lg:p-6 flex flex-col">
          <div class="flex-1 flex items-center justify-center">
            <div id="speakersArea" class="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-3xl">
              <!-- Speakers injected here -->
              <div class="col-span-full text-center text-zinc-500 py-12">
                <div class="text-5xl mb-3">🎤</div>
                <p>No one is speaking yet</p>
                <p class="text-sm mt-1">Be the first to take the stage</p>
              </div>
            </div>
          </div>

          <!-- Controls -->
          <div class="mt-6 flex flex-col items-center gap-4">
            <button id="pushToTalkBtn"
                    class="w-24 h-24 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-white text-3xl shadow-2xl shadow-sky-500/40 active:scale-95 transition flex items-center justify-center">
              🎤
            </button>
            <p class="text-sm text-zinc-400" id="talkStatus">Hold to speak • Release to stop</p>
            
            <div class="flex gap-3 mt-2">
              <button class="px-4 py-2 rounded-xl bg-zinc-800 text-sm">👏 Applause</button>
              <button class="px-4 py-2 rounded-xl bg-zinc-800 text-sm">🔥 Fire</button>
              <button class="px-4 py-2 rounded-xl bg-zinc-800 text-sm">🛡️ Seal Segment</button>
            </div>
          </div>
        </div>

        <!-- Audience sidebar -->
        <div class="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-zinc-800 bg-zinc-900/50 flex flex-col">
          <div class="p-4 border-b border-zinc-800 font-medium text-sm text-zinc-300">
            In this room (<span id="sidebarCount">0</span>)
          </div>
          <div id="participantsList" class="flex-1 overflow-y-auto p-3 space-y-2">
            <!-- Participants injected -->
          </div>
        </div>
      </div>
    </div>
  `;

  stage.classList.remove('hidden');

  // Wire controls & connect LiveKit WebRTC
  wireActiveRoomControls(roomId);

  // Live participants
  if (participantsUnsubscribe) participantsUnsubscribe();
  participantsUnsubscribe = onSnapshot(
    collection(db, 'liveRooms', roomId, 'participants'),
    (snap) => {
      const participants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderParticipants(participants);
      document.getElementById('liveListenerCount').textContent = participants.length;
      document.getElementById('sidebarCount').textContent = participants.length;
    }
  );
}

function renderParticipants(participants) {
  const list = document.getElementById('participantsList');
  const speakersArea = document.getElementById('speakersArea');
  if (!list || !speakersArea) return;

  // Audience list
  list.innerHTML = participants.map(p => `
    <div class="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-800/50">
      <div class="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold overflow-hidden">
        ${p.photoURL ? `<img src="${p.photoURL}" class="w-full h-full object-cover">` : (p.displayName?.[0] || '?')}
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate">${escapeHTML(p.displayName || 'Citizen')}</div>
        <div class="text-[11px] text-zinc-500">${escapeHTML(p.tier || 'citizen')}</div>
      </div>
      ${p.isSpeaking ? '<span class="text-sky-400 text-xs">Speaking</span>' : ''}
    </div>
  `).join('');

  // Speakers (people with isSpeaking = true)
  const speakers = participants.filter(p => p.isSpeaking);
  if (speakers.length === 0) {
    speakersArea.innerHTML = `
      <div class="col-span-full text-center text-zinc-500 py-12">
        <div class="text-5xl mb-3">🎤</div>
        <p>No one is speaking yet</p>
        <p class="text-sm mt-1">Hold the mic button to take the stage</p>
      </div>`;
  } else {
    speakersArea.innerHTML = speakers.map(s => `
      <div class="flex flex-col items-center p-4 rounded-2xl bg-sky-500/10 border border-sky-500/30">
        <div class="w-16 h-16 rounded-full bg-zinc-700 flex items-center justify-center text-xl font-bold mb-2 overflow-hidden ring-2 ring-sky-400">
          ${s.photoURL ? `<img src="${s.photoURL}" class="w-full h-full object-cover">` : (s.displayName?.[0] || '?')}
        </div>
        <div class="font-medium text-sm text-center">${escapeHTML(s.displayName)}</div>
        <div class="text-xs text-sky-400 mt-1">Speaking</div>
      </div>
    `).join('');
  }
}

// ========== LIVEKIT VOICE ENGINE ==========
async function connectToLiveKit(roomId) {
  try {
    const functions = getFunctions();
    const getToken = httpsCallable(functions, 'getLiveKitToken');

    const result = await getToken({
      roomName: roomId,
      participantName: auth.currentUser?.displayName || 'Citizen'
    });

    const { token, url } = result.data;

    livekitRoom = new Room({
      adaptiveStream: true,
      dynacast: true,
      audioCaptureDefaults: {
        autoGainControl: true,
        echoCancellation: true,
        noiseSuppression: true
      }
    });

    // Handle remote participants speaking / audio tracks
    livekitRoom.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const audioEl = track.attach();
        audioEl.id = `audio-${participant.identity}`;
        document.body.appendChild(audioEl);
      }
    });

    livekitRoom.on(RoomEvent.TrackUnsubscribed, (track) => {
      track.detach().forEach(el => el.remove());
    });

    livekitRoom.on(RoomEvent.ParticipantConnected, () => {
      console.log('Participant joined LiveKit room');
    });

    await livekitRoom.connect(url, token);
    console.log('Connected to LiveKit room:', roomId);
    showToast("Voice connected – ready to speak", "success");
  } catch (err) {
    console.error('LiveKit connect error:', err);
    showToast("Could not connect voice channel.", "error");
  }
}

async function startSpeaking() {
  if (!livekitRoom || isSpeaking) return;

  try {
    localAudioTrack = await livekitRoom.localParticipant.createAudioTrack({
      name: 'microphone'
    });
    await livekitRoom.localParticipant.publishTrack(localAudioTrack);

    isSpeaking = true;
    const talkBtn = document.getElementById('pushToTalkBtn');
    const status = document.getElementById('talkStatus');
    if (talkBtn) {
      talkBtn.classList.add('ring-4', 'ring-red-500', 'scale-110');
    }
    if (status) {
      status.textContent = "🔴 YOU ARE LIVE – Speak clearly";
      status.classList.add('text-red-400');
    }
    showToast("Mic active – you are live on stage", "info");
  } catch (err) {
    console.error('Failed to start speaking:', err);
    showToast("Microphone access denied or failed", "error");
  }
}

async function stopSpeaking() {
  if (!isSpeaking || !localAudioTrack) return;

  try {
    await livekitRoom.localParticipant.unpublishTrack(localAudioTrack);
    localAudioTrack.stop();
    localAudioTrack = null;
  } catch (e) {}

  isSpeaking = false;
  const talkBtn = document.getElementById('pushToTalkBtn');
  const status = document.getElementById('talkStatus');
  if (talkBtn) {
    talkBtn.classList.remove('ring-4', 'ring-red-500', 'scale-110');
  }
  if (status) {
    status.textContent = "Hold to speak • Release to stop";
    status.classList.remove('text-red-400');
  }
}

function wireActiveRoomControls(roomId) {
  const talkBtn = document.getElementById('pushToTalkBtn');

  // Connect voice as soon as room opens
  connectToLiveKit(roomId);

  // Push-to-talk listeners
  if (talkBtn) {
    talkBtn.addEventListener('mousedown', startSpeaking);
    talkBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startSpeaking(); });
    talkBtn.addEventListener('mouseup', stopSpeaking);
    talkBtn.addEventListener('mouseleave', stopSpeaking);
    talkBtn.addEventListener('touchend', stopSpeaking);
  }

  // Corroborate button
  document.getElementById('corroborateBtn')?.addEventListener('click', async () => {
    showToast("✅ Corroboration recorded – strengthens the evidence", "success");
  });
}

window.leaveCurrentRoom = async function () {
  if (livekitRoom) {
    await livekitRoom.disconnect();
    livekitRoom = null;
  }
  if (localAudioTrack) {
    localAudioTrack.stop();
    localAudioTrack = null;
  }
  isSpeaking = false;

  if (!currentRoomId) return;

  try {
    await updateDoc(doc(db, 'liveRooms', currentRoomId), {
      participantCount: increment(-1)
    });
  } catch (e) {}

  if (participantsUnsubscribe) participantsUnsubscribe();
  currentRoomId = null;

  document.getElementById('activeRoomView')?.classList.add('hidden');
  document.getElementById('lobbyView')?.classList.remove('hidden');
  history.pushState({}, '', window.location.pathname);

  showToast("Left the room", "info");
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

// Auto init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLiveArena);
} else {
  initLiveArena();
}
