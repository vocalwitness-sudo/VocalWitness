// js/witness-tab.js
// Witness Voice tab — higher-trust sealed reports only

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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Live feed of higher-trust / Witness Voice sealed reports
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

  // Prefer channel == 'witness-voice' or isZkVerified
  // Adjust field names to match your actual publish path
  const q = query(
    collection(db, 'testimonies'),
    where('channel', 'in', ['witness-voice', 'witness_voice']),
    orderBy('createdAt', 'desc'),
    limit(40)
  );

  // Fallback alternative if you still use isZkVerified:
  // const q = query(
  //   collection(db, 'testimonies'),
  //   where('isZkVerified', '==', true),
  //   orderBy('timestamp', 'desc'),
  //   limit(40)
  // );

  witnessReportsUnsub = onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        feed.innerHTML = `
          <div class="py-16 text-center text-zinc-500">
            <p class="text-5xl mb-3">🛡️</p>
            <p class="font-medium">No Witness Voice reports in the field yet.</p>
            <p class="text-xs text-zinc-600 mt-1">
              When citizens seal first-hand observations, they appear here.
            </p>
          </div>`;
        return;
      }

      feed.innerHTML = '';
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateStr = data.createdAt?.toDate
          ? data.createdAt.toDate().toLocaleString()
          : data.timestamp?.toDate
            ? data.timestamp.toDate().toLocaleString()
            : 'N/A';

        const text = String(data.content || data.text || data.body || '');
        const uid = (data.authorId || data.author?.uid || 'anon').toString();

        const div = document.createElement('div');
        div.className = 'rounded-2xl border border-amber-500/30 bg-zinc-900/60 p-5';
        div.innerHTML = `
          <div class="flex justify-between items-start mb-2 gap-3">
            <span class="text-[10px] font-medium bg-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full">
              🔬 Witness Voice
            </span>
            <span class="text-xs text-zinc-500 shrink-0">${dateStr}</span>
          </div>
          <p class="text-zinc-100 leading-relaxed text-sm whitespace-pre-wrap">
            ${escapeHtml(text.slice(0, 600))}${text.length > 600 ? '…' : ''}
          </p>
          <div class="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
            <span>ID: ${escapeHtml(uid.slice(0, 8))}…</span>
            <span class="text-emerald-400 font-medium">Sealed</span>
          </div>`;
        feed.appendChild(div);
      });
    },
    (err) => {
      console.error('[Witness Voice Reports]', err);
      feed.innerHTML = `
        <p class="text-red-400 text-center py-8 text-sm">
          Could not load sealed reports. Check Firestore indexes or rules.
        </p>`;
    }
  );
}

/**
 * Called when the Witness tab becomes active
 */
export function initWitnessTab() {
  loadHigherTrustReports();
}
