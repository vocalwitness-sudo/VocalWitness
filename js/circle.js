// js/circle.js - My Circle / Trusted Voices + Witness People Grid
import { db, auth } from './firebase-config.js';
import {
    doc, getDoc, updateDoc, arrayUnion, arrayRemove,
    collection, query, where, getDocs, limit
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

const CACHE_TTL_MS = 60_000; // 1 min
let _cache = {
    following: [],
    trusted: [],
    followers: [],
    loadedAt: 0,
    uid: null
};

function currentUid() {
    return auth.currentUser?.uid || null;
}

/** Load following + trusted (+ optional followers) for the signed-in user */
export async function loadCircle(force = false) {
    const uid = currentUid();
    if (!uid) {
        _cache = { following: [], trusted: [], followers: [], loadedAt: 0, uid: null };
        return _cache;
    }

    const fresh = Date.now() - _cache.loadedAt < CACHE_TTL_MS && _cache.uid === uid;
    if (!force && fresh) return _cache;

    const snap = await getDoc(doc(db, 'users', uid));
    const data = snap.exists() ? snap.data() : {};

    _cache = {
        following: Array.isArray(data.following) ? data.following : [],
        trusted: Array.isArray(data.trusted) ? data.trusted : [],
        followers: Array.isArray(data.followers) ? data.followers : [],
        loadedAt: Date.now(),
        uid
    };
    return _cache;
}

export function getCircleAuthorIds() {
    const set = new Set([..._cache.following, ..._cache.trusted]);
    return [...set];
}

export function getTrustedAuthorIds() {
    return [..._cache.trusted];
}

export function isInCircle(uid) {
    if (!uid) return false;
    return _cache.following.includes(uid) || _cache.trusted.includes(uid);
}

export function isTrusted(uid) {
    return !!uid && _cache.trusted.includes(uid);
}

export function hasCircle() {
    return getCircleAuthorIds().length > 0;
}

/** Follow a user */
export async function followUser(targetUid) {
    const uid = currentUid();
    if (!uid || !targetUid || uid === targetUid) return false;

    await updateDoc(doc(db, 'users', uid), {
        following: arrayUnion(targetUid)
    });
    try {
        await updateDoc(doc(db, 'users', targetUid), {
            followers: arrayUnion(uid)
        });
    } catch (_) { /* rules may block; non-fatal */ }

    if (!_cache.following.includes(targetUid)) _cache.following.push(targetUid);
    return true;
}

/** Unfollow */
export async function unfollowUser(targetUid) {
    const uid = currentUid();
    if (!uid || !targetUid) return false;

    await updateDoc(doc(db, 'users', uid), {
        following: arrayRemove(targetUid)
    });
    try {
        await updateDoc(doc(db, 'users', targetUid), {
            followers: arrayRemove(uid)
        });
    } catch (_) {}

    _cache.following = _cache.following.filter(id => id !== targetUid);
    _cache.trusted = _cache.trusted.filter(id => id !== targetUid);
    return true;
}

/** Mark as Trusted */
export async function trustUser(targetUid) {
    const uid = currentUid();
    if (!uid || !targetUid || uid === targetUid) return false;

    if (!_cache.following.includes(targetUid)) {
        await followUser(targetUid);
    }
    await updateDoc(doc(db, 'users', uid), {
        trusted: arrayUnion(targetUid)
    });
    if (!_cache.trusted.includes(targetUid)) _cache.trusted.push(targetUid);
    return true;
}

export async function untrustUser(targetUid) {
    const uid = currentUid();
    if (!uid || !targetUid) return false;

    await updateDoc(doc(db, 'users', uid), {
        trusted: arrayRemove(targetUid)
    });
    _cache.trusted = _cache.trusted.filter(id => id !== targetUid);
    return true;
}

export function circleEmptyMessage() {
    return 'Follow voices you trust to build your high-signal feed.';
}

// ====================== WITNESS PEOPLE GRID ======================

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function renderWitnessGrid(people) {
    const grid = document.getElementById('verified-witnesses-grid');
    if (!grid) return;

    if (people.length === 0) {
        grid.innerHTML = `
            <div class="col-span-full py-16 text-center text-zinc-500">
                <p class="text-4xl mb-3">🛡️</p>
                <p>No verified voices found yet.</p>
                <p class="text-sm mt-1">Be the first to complete Higher Trust verification.</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = people.map(p => `
        <div class="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5 hover:border-amber-500/40 transition">
            <div class="flex items-start gap-4">
                <div class="h-12 w-12 shrink-0 rounded-full bg-zinc-800 flex items-center justify-center text-xl overflow-hidden">
                    ${p.photoURL
                        ? `<img src="${escapeHtml(p.photoURL)}" alt="" class="h-full w-full object-cover">`
                        : '🛡️'}
                </div>
                <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap">
                        <h3 class="font-semibold text-white truncate">${escapeHtml(p.displayName)}</h3>
                        ${p.zkVerified
                            ? `<span class="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">Higher Trust</span>`
                            : p.isPhoneVerified
                                ? `<span class="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">Phone</span>`
                                : ''}
                    </div>
                    <p class="mt-1 text-xs text-zinc-400">Rep: ${p.reputation ?? 0}</p>
                    ${p.bio ? `<p class="mt-2 text-sm text-zinc-300 line-clamp-2">${escapeHtml(p.bio)}</p>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Load verified people into the Witness tab grid
 * Uses publicProfiles (publicly readable) instead of private users collection.
 * @param {'all'|'zk'|'phone'} filter
 */
export async function loadVerifiedWitnesses(filter = 'all') {
    const grid = document.getElementById('verified-witnesses-grid');
    if (!grid) {
        console.warn('[Witness] #verified-witnesses-grid not found');
        return;
    }

    grid.innerHTML = `
        <div class="col-span-full py-16 text-center text-zinc-500">
            <div class="animate-pulse text-4xl mb-3">🛡️</div>
            <p>Loading verified voices…</p>
        </div>
    `;

    try {
        let people = [];

        // Primary query – Higher Trust (ZK)
        // No orderBy → avoids composite index requirement; sort client-side below
        if (filter === 'all' || filter === 'zk') {
            const zkQ = query(
                collection(db, 'publicProfiles'),
                where('zkVerified', '==', true),
                limit(30)
            );
            const zkSnap = await getDocs(zkQ);
            zkSnap.forEach(docSnap => {
                const d = docSnap.data();
                people.push({
                    uid: d.uid || docSnap.id,
                    displayName: d.displayName || d.name || 'Anonymous Witness',
                    photoURL: d.photoURL || null,
                    reputation: d.reputation || 0,
                    zkVerified: true,
                    isPhoneVerified: !!(d.isPhoneVerified || d.hasVerifiedPhone || d.isVerified),
                    bio: d.bio || ''
                });
            });
        }

        // Phone verified (when filter is phone or when all returned nothing)
        if (filter === 'phone' || (filter === 'all' && people.length === 0)) {
            const phoneQ = query(
                collection(db, 'publicProfiles'),
                where('isPhoneVerified', '==', true),
                limit(30)
            );
            const phoneSnap = await getDocs(phoneQ);
            phoneSnap.forEach(docSnap => {
                if (people.some(p => p.uid === (docSnap.data().uid || docSnap.id))) return;
                const d = docSnap.data();
                people.push({
                    uid: d.uid || docSnap.id,
                    displayName: d.displayName || d.name || 'Anonymous Witness',
                    photoURL: d.photoURL || null,
                    reputation: d.reputation || 0,
                    zkVerified: !!d.zkVerified,
                    isPhoneVerified: true,
                    bio: d.bio || ''
                });
            });
        }

        // Sort by reputation descending (client-side)
        people.sort((a, b) => (b.reputation || 0) - (a.reputation || 0));

        renderWitnessGrid(people);
    } catch (err) {
        console.error('[Witness] Failed to load people:', err);
        grid.innerHTML = `
            <div class="col-span-full py-16 text-center text-zinc-500">
                <p class="text-4xl mb-3">🛡️</p>
                <p>Could not load verified voices right now.</p>
                <p class="text-xs mt-2 text-zinc-600">Check console / Firestore indexes or rules.</p>
            </div>
        `;
    }
}

// ====================== HIGHER-TRUST REPORTS (True Witness, in-app) ======================
import {
  onSnapshot,
  where,
  orderBy
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
// (if you already import query, collection, getDocs, limit — reuse those; only add missing ones)

let witnessReportsUnsub = null;

/**
 * Live feed of higher-trust / ZK-sealed reports inside the Witness tab.
 * This replaces the separate true-witness.html page.
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

  // Prefer isZkVerified / hasZKProof / channel witness-voice — adjust field names to match your writes
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
        // Fallback: also try hasZKProof or channel
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
        const text = data.content || data.text || data.body || '';
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
 * Switch between Reports and People inside the Witness tab
 */
export function initWitnessSubTabs() {
  const reportsBtn = document.getElementById('witness-sub-reports');
  const peopleBtn = document.getElementById('witness-sub-people');
  const reportsView = document.getElementById('witness-reports-view');
  const peopleView = document.getElementById('witness-people-view');
  if (!reportsBtn || !peopleBtn || !reportsView || !peopleView) return;

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

  reportsBtn.onclick = () => setView('reports');
  peopleBtn.onclick = () => setView('people');

  // People filters (reuse existing)
  document.querySelectorAll('#witness-filters [data-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#witness-filters [data-filter]').forEach((b) => {
        b.setAttribute('aria-pressed', 'false');
        b.className = 'rounded-full border border-zinc-700 bg-zinc-800 px-4 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-amber-500/50';
      });
      btn.setAttribute('aria-pressed', 'true');
      btn.className = 'rounded-full border border-amber-500/40 bg-amber-500/15 px-4 py-1.5 text-xs font-medium text-amber-400';
      loadVerifiedWitnesses(btn.dataset.filter || 'all');
    });
  });
}

// at the bottom of circle.js exports area
export { loadHigherTrustReports, initWitnessSubTabs };
