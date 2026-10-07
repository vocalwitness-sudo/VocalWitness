// js/witness-tab.js - Witness tab: Higher-Trust Reports + sub-tab UI
// Circle (follow/trust) stays in circle.js. This is the field office for sealed reports.

import { db } from './firebase-config.js';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';
import { loadVerifiedWitnesses } from './circle.js';

let witnessReportsUnsub = null;
let witnessSubTabsWired = false;

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
 * Live feed of higher-trust / ZK-sealed reports (True Witness, in-app).
 */
export function loadHigherTrustReports() {
  const feed = document.getElementById('witness-reports-feed');
  if (!feed) return;

  feed.innerHTML = `
    <div class="py-12 text-center text-zinc-400">
      <div class="animate-pulse text-4xl mb-3">🔬</div>
      <p>Loading higher-trust field reports…</p>
    </div>`;

  if (typeof witnessReportsUnsub === 'function') {
    witnessReportsUnsub();
    witnessReportsUnsub = null;
  }

  // Adjust field names if your publish path uses hasZKProof / createdAt / channel
  const q = query(
    collection(db, 'testimonies'),
    where('isZkVerified', '==', true),
    orderBy('timestamp', 'desc'),
    limit(40)
  );

  witnessReportsUnsub = onSnapshot(
    q,
    (snapshot) => {
      if (snapshot.empty) {
        feed.innerHTML = `
          <div class="py-16 text-center text-zinc-500">
            <p class="text-5xl mb-3">🛡️</p>
            <p class="font-medium">No higher-trust reports in the field yet.</p>
            <p class="text-xs text-zinc-600 mt-1">When citizens seal reports with cryptographic proof, they appear here.</p>
          </div>`;
        return;
      }

      feed.innerHTML = '';
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const dateStr = data.timestamp?.toDate
          ? data.timestamp.toDate().toLocaleString()
          : data.createdAt?.toDate
            ? data.createdAt.toDate().toLocaleString()
            : 'N/A';
        const text = String(data.content || data.text || data.body || '');
        const uid = (data.authorId || data.author?.uid || 'anon').toString();

        const div = document.createElement('div');
        div.className = 'rounded-2xl border border-amber-500/30 bg-zinc-900/60 p-5';
        div.innerHTML = `
          <div class="flex justify-between items-start mb-2 gap-3">
            <span class="text-[10px] font-medium bg-amber-500/20 text-amber-400 px-2.5 py-1 rounded-full">🔬 Higher Trust</span>
            <span class="text-xs text-zinc-500 shrink-0">${dateStr}</span>
          </div>
          <p class="text-zinc-100 leading-relaxed text-sm whitespace-pre-wrap">${escapeHtml(text.slice(0, 600))}${text.length > 600 ? '…' : ''}</p>
          <div class="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between text-xs text-zinc-400">
            <span>ID: ${escapeHtml(uid.slice(0, 8))}…</span>
            <span class="text-emerald-400 font-medium">Sealed</span>
          </div>`;
        feed.appendChild(div);
      });
    },
    (err) => {
      console.error('[Witness Reports]', err);
      feed.innerHTML = `
        <p class="text-red-400 text-center py-8 text-sm">
          Could not load higher-trust feed. Check Firestore indexes (isZkVerified + timestamp).
        </p>`;
    }
  );
}

/**
 * Wire Reports | People sub-tabs inside the Witness tab.
 */
export function initWitnessSubTabs() {
  const reportsBtn = document.getElementById('witness-sub-reports');
  const peopleBtn = document.getElementById('witness-sub-people');
  const reportsView = document.getElementById('witness-reports-view');
  const peopleView = document.getElementById('witness-people-view');

  if (!reportsBtn || !peopleBtn || !reportsView || !peopleView) {
    console.warn('[Witness] Sub-tab elements missing — check index.html Witness section');
    return;
  }

  const setView = (view) => {
    const isReports = view === 'reports';

    reportsView.classList.toggle('hidden', !isReports);
    peopleView.classList.toggle('hidden', isReports);

    reportsBtn.setAttribute('aria-selected', isReports ? 'true' : 'false');
    peopleBtn.setAttribute('aria-selected', isReports ? 'false' : 'true');

    reportsBtn.classList.toggle('border-amber-500', isReports);
    reportsBtn.classList.toggle('text-amber-400', isReports);
    reportsBtn.classList.toggle('border-transparent', !isReports);
    reportsBtn.classList.toggle('text-zinc-400', !isReports);

    peopleBtn.classList.toggle('border-amber-500', !isReports);
    peopleBtn.classList.toggle('text-amber-400', !isReports);
    peopleBtn.classList.toggle('border-transparent', isReports);
    peopleBtn.classList.toggle('text-zinc-400', isReports);

    if (isReports) {
      loadHigherTrustReports();
    } else {
      loadVerifiedWitnesses('all');
    }
  };

  if (!witnessSubTabsWired) {
    witnessSubTabsWired = true;

    reportsBtn.addEventListener('click', () => setView('reports'));
    peopleBtn.addEventListener('click', () => setView('people'));

    document.querySelectorAll('#witness-filters [data-filter]').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#witness-filters [data-filter]').forEach((b) => {
          b.setAttribute('aria-pressed', 'false');
          b.className =
            'rounded-full border border-zinc-700 bg-zinc-800 px-4 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-amber-500/50';
        });
        btn.setAttribute('aria-pressed', 'true');
        btn.className =
          'rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-1.5 text-xs font-medium text-amber-400';
        loadVerifiedWitnesses(btn.dataset.filter || 'all');
      });
    });
  }

  setView('reports');
}
