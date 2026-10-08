// js/witness-tab.js
// Witness Voice tab — sealed higher-trust reports + citizen reports section
// Clean version (People sub-tab removed)

import { db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

let witnessReportsUnsub = null;
let citizenReportsUnsub = null;

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDate(data) {
  if (data?.createdAt?.toDate) return data.createdAt.toDate().toLocaleString();
  if (data?.timestamp?.toDate) return data.timestamp.toDate().toLocaleString();
  if (typeof data?.createdAt === 'string') return new Date(data.createdAt).toLocaleString();
  return 'N/A';
}

/**
 * Create a reusable report card
 */
function createReportCard(data, options = {}) {
  const {
    badgeText = '🔬 Witness Voice',
    badgeClass = 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
  } = options;

  const text = String(data.content || data.text || data.body || '');
  const uid = (data.authorId || data.author?.uid || data.uid || 'anon').toString();
  const dateStr = formatDate(data);
  const hasMedia = !!(data.audioUrl || data.imageUrl || data.videoUrl || data.mediaUrl);

  const div = document.createElement('div');
  div.className = 'rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 hover:border-amber-500/40 transition';
  div.innerHTML = `
    <div class="flex justify-between items-start mb-3 gap-3">
      <span class="text-[10px] font-medium ${badgeClass} px-2.5 py-1 rounded-full">
        ${badgeText}
      </span>
      <span class="text-xs text-zinc-500 shrink-0">${escapeHtml(dateStr)}</span>
    </div>

    <p class="text-zinc-100 leading-relaxed text-sm whitespace-pre-wrap">
      ${escapeHtml(text.slice(0, 520))}${text.length > 520 ? '…' : ''}
    </p>

    <div class="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
      <div class="flex items-center gap-3">
        <span>ID: ${escapeHtml(uid.slice(0, 8))}…</span>
        ${hasMedia ? '<span class="text-zinc-500">📎 Media</span>' : ''}
      </div>
      <span class="text-emerald-400 font-medium flex items-center gap-1">
        <span>🛡️</span> Sealed
      </span>
    </div>
  `;
  return div;
}

/**
 * Load sealed Witness Voice / higher-trust reports
 */
export function loadHigherTrustReports() {
  const feed = document.getElementById('witness-reports-feed');
  if (!feed) return;

  feed.innerHTML = `
    <div class="py-12 text-center text-zinc-400">
      <div class="animate-pulse text-4xl mb-3">🔬</div>
      <p>Loading sealed Witness Voice reports…</p>
    </div>`;

  if (typeof witnessReportsUnsub === 'function') {
    witnessReportsUnsub();
    witnessReportsUnsub = null;
  }

  // Primary query – adjust field names if your publish path is different
  const q = query(
    collection(db, 'testimonies'),
    where('channel', 'in', ['witness-voice', 'witness_voice']),
    orderBy('createdAt', 'desc'),
    limit(30)
  );

  // Alternative if you currently use isZkVerified:
  // const q = query(
  //   collection(db, 'testimonies'),
  //   where('isZkVerified', '==', true),
  //   orderBy('createdAt', 'desc'),
  //   limit(30)
  // );

  witnessReportsUnsub = onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        feed.innerHTML = `
          <div class="py-14 text-center text-zinc-500">
            <p class="text-4xl mb-3">🛡️</p>
            <p class="font-medium">No Witness Voice reports in the field yet.</p>
            <p class="text-xs text-zinc-600 mt-1">
              Be among the first to publish a cryptographically sealed observation.
            </p>
          </div>`;
        return;
      }

      feed.innerHTML = '';
      snapshot.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() };
        feed.appendChild(
          createReportCard(data, {
            badgeText: '🔬 Witness Voice',
            badgeClass: 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          })
        );
      });
    },
    (err) => {
      console.error('[Witness Voice Reports]', err);
      feed.innerHTML = `
        <div class="py-10 text-center">
          <p class="text-red-400 text-sm mb-2">Could not load sealed reports.</p>
          <p class="text-xs text-zinc-500">Check Firestore indexes or security rules.</p>
        </div>`;
    }
  );
}

/**
 * Load recent citizen reports (open channel)
 */
export function loadCitizenReports() {
  const feed = document.getElementById('citizen-reports-feed');
  if (!feed) return;

  feed.innerHTML = `
    <div class="py-10 text-center text-zinc-500">
      <div class="animate-pulse text-3xl mb-2">🗣️</div>
      <p class="text-sm">Loading citizen reports…</p>
    </div>`;

  if (typeof citizenReportsUnsub === 'function') {
    citizenReportsUnsub();
    citizenReportsUnsub = null;
  }

  const q = query(
    collection(db, 'testimonies'),
    where('channel', 'in', ['citizen-talk', 'citizen_talk', 'citizen-circle']),
    orderBy('createdAt', 'desc'),
    limit(12)
  );

  citizenReportsUnsub = onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        feed.innerHTML = `
          <div class="py-10 text-center text-zinc-500">
            <p class="text-3xl mb-2">🗣️</p>
            <p class="text-sm">No citizen reports yet.</p>
          </div>`;
        return;
      }

      feed.innerHTML = '';
      snapshot.forEach((docSnap) => {
        const data = { id: docSnap.id, ...docSnap.data() };
        feed.appendChild(
          createReportCard(data, {
            badgeText: '🗣️ Citizen Report',
            badgeClass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
          })
        );
      });
    },
    (err) => {
      console.error('[Citizen Reports]', err);
      feed.innerHTML = `
        <p class="text-red-400 text-center py-6 text-sm">
          Could not load citizen reports.
        </p>`;
    }
  );
}

/**
 * Called when the Witness tab becomes active
 */
export function initWitnessTab() {
  loadHigherTrustReports();
  loadCitizenReports();
}

/**
 * Clean up listeners when leaving the tab
 */
export function destroyWitnessTab() {
  if (typeof witnessReportsUnsub === 'function') {
    witnessReportsUnsub();
    witnessReportsUnsub = null;
  }
  if (typeof citizenReportsUnsub === 'function') {
    citizenReportsUnsub();
    citizenReportsUnsub = null;
  }
}
