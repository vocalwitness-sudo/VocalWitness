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
import { Room, RoomEvent, Track } from 'https://cdn.jsdelivr.net/npm/livekit-client@2.5.0/dist/livekit-client.esm.mjs';
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

export function initLiveArena() {
  console.log('[LiveArena] World-class engine starting…');

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
    limit(80)
  );
  roomsUnsubscribe = onSnapshot(roomsQuery, (snap) => {
    allRoomsCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    applyFilterAndRender();
  });

  // Create button
  document.getElementById('createRoomBtn')?.addEventListener('click', createRoom);

  // Filter buttons
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.dataset.filter;
      document.querySelectorAll('[data-filter]').forEach(b => {
        b.classList.remove('bg-sky-500/20', 'text-sky-300', 'border-sky-500/40');
        b.classList.add('bg-zinc-800', 'text-zinc-400');
      });
      btn.classList.remove('bg-zinc-800', 'text-zinc-400');
      btn.classList.add('bg-sky-500/20', 'text-sky-300', 'border', 'border-sky-500/40');
      applyFilterAndRender();
    });
  });

  // Check if we landed on a specific room
  const urlParams = new URLSearchParams(window.location.search);
  const roomId = urlParams.get('room');
  if (roomId) {
    joinLiveRoom(roomId, true);
  }

  // Cleanup on leave
  window.addEventListener('beforeunload', () => {
    if (currentRoomId) leaveCurrentRoom(true);
  });
}

function applyFilterAndRender() {
  let rooms = [...allRoomsCache];

  if (currentFilter === 'near') {
    rooms = rooms.filter(r => r.city);
  } else if (currentFilter === 'circle') {
    rooms = rooms.filter(r => r.tierRequired && r.tierRequired !== 'Open');
  } else if (currentFilter !== 'all') {
    rooms = rooms.filter(r =>
      (r.category || '').toLowerCase() === currentFilter ||
      (r.title || '').toLowerCase().includes(currentFilter) ||
      (r.description || '').toLowerCase().includes(currentFilter)
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
    return `
    <div class="glass rounded-2xl border border-sky-500/20 p-5 hover:border-sky-400/50 hover:scale-[1.01] transition-all cursor-pointer group relative overflow-hidden"
         onclick="window.joinLiveRoom('${room.id}')">
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

async function createRoom() {
  if (!requireAuth("Sign in to start a room")) return;

  const title = prompt("Room title (e.g. Lagos Traffic – Happening Right Now)");
  if (!title || title.trim().length < 6) {
    showToast("Title too short (min 6 characters)", "warning");
    return;
  }
  const description = prompt("Short description (optional)") || "";
  const category = prompt("Category (Traffic, Safety, Protest, Weather, Election, General)") || "General";

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

window.joinLiveRoom = async function (roomId, alreadyInUrl = false) {
  if (!requireAuth("Sign in to join")) return;
  if (currentRoomId === roomId) return;

  try {
    if (currentRoomId) await leaveCurrentRoom();

    currentRoomId = roomId;

    const roomSnap = await getDoc(doc(db, 'liveRooms', roomId));
    const roomData = roomSnap.data() || {};
    isHost = roomData.createdBy === auth.currentUser.uid;

    await updateDoc(doc(db, 'liveRooms', roomId), {
      participantCount: increment(1),
      lastActivityAt: serverTimestamp()
    });

    const userTier = await getCurrentUserTier();
    myParticipantDocId = auth.currentUser.uid;

    await setDoc(doc(db, 'liveRooms', roomId, 'participants', auth.currentUser.uid), {
      uid: auth.currentUser.uid,
      displayName: auth.currentUser.displayName || 'Citizen',
      photoURL: auth.currentUser.photoURL || null,
      tier: userTier,
      joinedAt: serverTimestamp(),
      isSpeaking: false,
      isMuted: false,
      isHost: isHost,
      handRaised: false
    }, { merge: true });

    if (!alreadyInUrl) {
      history.pushState({}, '', `?room=${roomId}`);
    }

    showActiveRoom(roomId, roomData);
  } catch (err) {
    console.error(err);
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

  stage.innerHTML = `
    <div class="fixed inset-0 z-50 bg-[#0a0f1c] flex flex-col">
      <!-- Top bar -->
      <div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800/80 bg-zinc-900/70 backdrop-blur-xl">
        <div class="flex items-center gap-3 min-w-0">
          <button onclick="window.leaveCurrentRoom()" class="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 transition">
            ←
          </button>
          <div class="min-w-0">
            <h2 class="font-bold text-white truncate text-base sm:text-lg">${escapeHTML(room.title || 'Live Room')}</h2>
            <p class="text-xs text-red-400 flex items-center gap-1.5 mt-0.5">
              <span class="relative flex h-2 w-2">
                <span class="animate-ping absolute h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span class="relative inline-flex h-2 w-2 rounded-full bg-red-500"></span>
              </span>
              LIVE • <span id="liveListenerCount">${room.participantCount || 1}</span> listening
              ${room.category ? `• ${escapeHTML(room.category)}` : ''}
            </p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button id="corroborateBtn" class="px-3 py-1.5 rounded-lg bg-emerald-500/15 text-emerald-400 text-sm font-medium hover:bg-emerald-500/25 transition flex items-center gap-1.5">
            ✅ I saw this
            <span id="corroborationCount" class="bg-emerald-500/20 text-emerald-300 text-xs px-1.5 py-0.5 rounded-md font-bold">0</span>
          </button>
          <button id="sealBtn" class="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-400 text-sm font-medium hover:bg-amber-500/25 transition">
            🛡️ Seal
          </button>
          <button id="reportBtn" class="px-3 py-1.5 rounded-lg bg-zinc-800 text-zinc-400 text-sm hover:bg-zinc-700">Report</button>
        </div>
      </div>

      <!-- Main stage -->
      <div class="flex-1 flex flex-col lg:flex-row overflow-hidden">
        <!-- Speakers Stage -->
        <div class="flex-1 p-4 lg:p-6 flex flex-col">
          <div class="flex-1 flex items-center justify-center">
            <div id="speakersArea" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 w-full max-w-4xl">
              <div class="col-span-full text-center text-zinc-500 py-16">
                <div class="text-5xl mb-3 opacity-60">🎤</div>
                <p class="font-medium">No one is speaking yet</p>
                <p class="text-sm mt-1 text-zinc-600">Hold the mic to take the stage</p>
              </div>
            </div>
          </div>

          <!-- Controls -->
          <div class="mt-4 flex flex-col items-center gap-4 pb-2">
            <button id="pushToTalkBtn"
                    class="w-24 h-24 rounded-full bg-gradient-to-br from-sky-500 to-cyan-500 text-white text-3xl shadow-2xl shadow-sky-500/30 active:scale-95 transition-all flex items-center justify-center select-none">
              🎤
            </button>
            <p class="text-sm text-zinc-400" id="talkStatus">Hold to speak • Release to stop</p>

            <div class="flex gap-3 mt-1">
              <button id="raiseHandBtn" class="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition">
                ✋ Raise Hand
              </button>
              <button class="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition">👏</button>
              <button class="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm transition">🔥</button>
            </div>

            <!-- Host Control Center (Underneath mic controls) -->
            <div id="hostControls" class="hidden mt-3 flex flex-wrap justify-center gap-2">
              <button id="muteAllBtn" class="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm hover:bg-zinc-700">🔇 Mute All</button>
              <button id="lowerHandsBtn" class="px-3 py-1.5 rounded-lg bg-zinc-800 text-sm hover:bg-zinc-700">✋ Lower All Hands</button>
            </div>
          </div>
        </div>

        <!-- Audience sidebar -->
        <div class="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-zinc-800 bg-zinc-900/40 flex flex-col">
          <div class="p-4 border-b border-zinc-800 font-medium text-sm text-zinc-300 flex justify-between">
            <span>In this room</span>
            <span id="sidebarCount" class="text-zinc-500">0</span>
          </div>
          <div id="participantsList" class="flex-1 overflow-y-auto p-3 space-y-1.5">
            <!-- Participants injected -->
          </div>
        </div>
      </div>
    </div>
  `;

  stage.classList.remove('hidden');

  if (isHost) {
    document.getElementById('hostControls')?.classList.remove('hidden');
  }

  wireActiveRoomControls(roomId);

  if (participantsUnsubscribe) participantsUnsubscribe();
  participantsUnsubscribe = onSnapshot(
    collection(db, 'liveRooms', roomId, 'participants'),
    (snap) => {
      const participants = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      renderParticipants(participants);
      const count = participants.length;
      document.getElementById('liveListenerCount').textContent = count;
      document.getElementById('sidebarCount').textContent = count;
    }
  );

  // Live Corroboration Counter
  const corrUnsub = onSnapshot(
    collection(db, 'liveRooms', roomId, 'corroborations'),
    (snap) => {
      const count = snap.size;
      const el = document.getElementById('corroborationCount');
      if (el) {
        el.textContent = count;
        if (count > 0) {
          el.classList.add('animate-pulse');
          setTimeout(() => el.classList.remove('animate-pulse'), 800);
        }
      }
    }
  );

  window._corrUnsub = corrUnsub;
}

function renderParticipants(participants) {
  const list = document.getElementById('participantsList');
  const speakersArea = document.getElementById('speakersArea');
  if (!list || !speakersArea) return;

  list.innerHTML = participants.map(p => {
    const isMe = p.uid === auth.currentUser?.uid;
    const showHostActions = isHost && !isMe;

    return `
    <div class="flex items-center gap-3 p-2 rounded-xl hover:bg-zinc-800/60 transition group">
      <div class="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-sm font-bold overflow-hidden shrink-0">
        ${p.photoURL ? `<img src="${p.photoURL}" class="w-full h-full object-cover" alt="">` : (p.displayName?.[0] || '?')}
      </div>
      <div class="min-w-0 flex-1">
        <div class="text-sm font-medium truncate flex items-center gap-1.5">
          ${escapeHTML(p.displayName || 'Citizen')}
          ${p.isHost ? '<span class="text-[10px] bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">HOST</span>' : ''}
        </div>
        <div class="text-[11px] text-zinc-500">${escapeHTML(p.tier || 'citizen')}</div>
      </div>
      
      ${p.handRaised ? '<span class="text-amber-400 text-sm">✋</span>' : ''}
      ${p.isSpeaking ? '<span class="text-sky-400 text-xs font-medium">Speaking</span>' : ''}

      ${showHostActions ? `
        <div class="hidden group-hover:flex gap-1">
          <button onclick="window.hostAction('${p.uid}', 'mute')" class="text-xs px-2 py-1 rounded bg-zinc-700 hover:bg-zinc-600">Mute</button>
          <button onclick="window.hostAction('${p.uid}', 'promote')" class="text-xs px-2 py-1 rounded bg-sky-600/30 hover:bg-sky-600/50 text-sky-300">Promote</button>
          <button onclick="window.hostAction('${p.uid}', 'remove')" class="text-xs px-2 py-1 rounded bg-red-600/20 hover:bg-red-600/40 text-red-400">Remove</button>
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
          ${s.photoURL ? `<img src="${s.photoURL}" class="w-full h-full object-cover" alt="">` : (s.displayName?.[0] || '?')}
        </div>
        <div class="font-medium text-sm text-center truncate w-full">${escapeHTML(s.displayName)}</div>
        <div class="text-xs text-sky-400 mt-1 font-medium">Speaking</div>
        ${s.isHost ? '<div class="text-[10px] text-amber-400 mt-0.5">HOST</div>' : ''}
      </div>
    `).join('');
  }
}

// ========== LIVEKIT ==========
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

    await livekitRoom.connect(url, token);
    console.log('Connected to LiveKit:', roomId);
    showToast("Voice connected – ready to speak", "success");
  } catch (err) {
    console.error('LiveKit connect error:', err);
    showToast("Could not connect voice channel", "error");
  }
}

async function startSpeaking() {
  if (!livekitRoom || isSpeaking) return;

  try {
    localAudioTrack = await livekitRoom.localParticipant.createAudioTrack({ name: 'microphone' });
    await livekitRoom.localParticipant.publishTrack(localAudioTrack);

    isSpeaking = true;

    if (myParticipantDocId && currentRoomId) {
      await updateDoc(doc(db, 'liveRooms', currentRoomId, 'participants', myParticipantDocId), {
        isSpeaking: true
      });
      await updateDoc(doc(db, 'liveRooms', currentRoomId), {
        speakingCount: increment(1)
      });
    }

    const talkBtn = document.getElementById('pushToTalkBtn');
    const status = document.getElementById('talkStatus');
    if (talkBtn) talkBtn.classList.add('ring-4', 'ring-red-500', 'scale-110', 'shadow-red-500/40');
    if (status) {
      status.textContent = "🔴 YOU ARE LIVE – Speak clearly";
      status.classList.add('text-red-400');
    }
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

  if (myParticipantDocId && currentRoomId) {
    await updateDoc(doc(db, 'liveRooms', currentRoomId, 'participants', myParticipantDocId), {
      isSpeaking: false
    });
    await updateDoc(doc(db, 'liveRooms', currentRoomId), {
      speakingCount: increment(-1)
    });
  }

  const talkBtn = document.getElementById('pushToTalkBtn');
  const status = document.getElementById('talkStatus');
  if (talkBtn) talkBtn.classList.remove('ring-4', 'ring-red-500', 'scale-110', 'shadow-red-500/40');
  if (status) {
    status.textContent = "Hold to speak • Release to stop";
    status.classList.remove('text-red-400');
  }
}

function wireActiveRoomControls(roomId) {
  connectToLiveKit(roomId);

  const talkBtn = document.getElementById('pushToTalkBtn');
  if (talkBtn) {
    talkBtn.addEventListener('mousedown', startSpeaking);
    talkBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startSpeaking(); }, { passive: false });
    talkBtn.addEventListener('mouseup', stopSpeaking);
    talkBtn.addEventListener('mouseleave', stopSpeaking);
    talkBtn.addEventListener('touchend', stopSpeaking);
  }

  document.getElementById('corroborateBtn')?.addEventListener('click', async () => {
    if (!requireAuth()) return;

    try {
      const existing = await getDocs(
        query(
          collection(db, 'liveRooms', roomId, 'corroborations'),
          where('uid', '==', auth.currentUser.uid)
        )
      );

      if (!existing.empty) {
        showToast("You already corroborated this room", "info");
        return;
      }

      await addDoc(collection(db, 'liveRooms', roomId, 'corroborations'), {
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

  document.getElementById('raiseHandBtn')?.addEventListener('click', async () => {
    if (!myParticipantDocId) return;
    try {
      const ref = doc(db, 'liveRooms', roomId, 'participants', myParticipantDocId);
      const snap = await getDoc(ref);
      const currentlyRaised = snap.data()?.handRaised || false;
      await updateDoc(ref, { handRaised: !currentlyRaised });
      showToast(currentlyRaised ? "Hand lowered" : "Hand raised – waiting for host", "info");
    } catch (err) {
      console.error(err);
    }
  });

  // Mute All
  document.getElementById('muteAllBtn')?.addEventListener('click', async () => {
    if (!isHost) return;
    const snap = await getDocs(collection(db, 'liveRooms', roomId, 'participants'));
    const batchPromises = [];
    snap.forEach(d => {
      if (d.id !== auth.currentUser.uid) {
        batchPromises.push(updateDoc(d.ref, { isSpeaking: false, handRaised: false }));
      }
    });
    await Promise.all(batchPromises);
    showToast("All participants muted", "info");
  });

  // Lower All Hands
  document.getElementById('lowerHandsBtn')?.addEventListener('click', async () => {
    if (!isHost) return;
    const snap = await getDocs(collection(db, 'liveRooms', roomId, 'participants'));
    const batchPromises = [];
    snap.forEach(d => {
      batchPromises.push(updateDoc(d.ref, { handRaised: false }));
    });
    await Promise.all(batchPromises);
    showToast("All hands lowered", "info");
  });
}

window.hostAction = async function(uid, action) {
  if (!isHost || !currentRoomId) return;

  const ref = doc(db, 'liveRooms', currentRoomId, 'participants', uid);

  try {
    if (action === 'mute') {
      await updateDoc(ref, { isSpeaking: false, handRaised: false });
      showToast("Participant muted", "info");
    } 
    else if (action === 'promote') {
      await updateDoc(ref, { isSpeaking: true, handRaised: false });
      showToast("Participant promoted to speaker", "success");
    } 
    else if (action === 'remove') {
      await deleteDoc(ref);
      await updateDoc(doc(db, 'liveRooms', currentRoomId), {
        participantCount: increment(-1)
      });
      showToast("Participant removed", "info");
    }
  } catch (err) {
    console.error(err);
    showToast("Action failed", "error");
  }
};

window.leaveCurrentRoom = async function (silent = false) {
  if (livekitRoom) {
    await livekitRoom.disconnect();
    livekitRoom = null;
  }
  if (localAudioTrack) {
    localAudioTrack.stop();
    localAudioTrack = null;
  }
  isSpeaking = false;

  if (window._corrUnsub) {
    window._corrUnsub();
    window._corrUnsub = null;
  }

  if (!currentRoomId) return;

  try {
    if (myParticipantDocId) {
      await deleteDoc(doc(db, 'liveRooms', currentRoomId, 'participants', myParticipantDocId));
    }
    await updateDoc(doc(db, 'liveRooms', currentRoomId), {
      participantCount: increment(-1)
    });
  } catch (e) {}

  if (participantsUnsubscribe) participantsUnsubscribe();
  currentRoomId = null;
  myParticipantDocId = null;
  isHost = false;

  document.getElementById('activeRoomView')?.classList.add('hidden');
  document.getElementById('lobbyView')?.classList.remove('hidden');
  history.pushState({}, '', window.location.pathname);

  if (!silent) showToast("Left the room", "info");
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
