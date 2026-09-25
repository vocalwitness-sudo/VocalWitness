// js/circle.js - My Circle / Trusted Voices + Witness People Grid
import { db, auth } from './firebase-config.js';
import {
    doc, getDoc, updateDoc, arrayUnion, arrayRemove,
    collection, query, where, getDocs, limit, orderBy
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
                        ? `<img src="${p.photoURL}" alt="" class="h-full w-full object-cover">`
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
                    <p class="mt-1 text-xs text-zinc-400">Rep: ${p.reputation}</p>
                    ${p.bio ? `<p class="mt-2 text-sm text-zinc-300 line-clamp-2">${escapeHtml(p.bio)}</p>` : ''}
                </div>
            </div>
        </div>
    `).join('');
}

/**
 * Load verified people into the Witness tab grid
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
        if (filter === 'all' || filter === 'zk') {
            const zkQ = query(
                collection(db, 'users'),
                where('zkVerified', '==', true),
                orderBy('reputation', 'desc'),
                limit(30)
            );
            const zkSnap = await getDocs(zkQ);
            zkSnap.forEach(docSnap => {
                const d = docSnap.data();
                people.push({
                    uid: docSnap.id,
                    displayName: d.displayName || d.name || 'Anonymous Witness',
                    photoURL: d.photoURL || null,
                    reputation: d.reputation || 0,
                    zkVerified: true,
                    isPhoneVerified: !!(d.isPhoneVerified || d.hasVerifiedPhone),
                    bio: d.bio || ''
                });
            });
        }

        // Phone verified (when filter is phone or when all returned nothing)
        if (filter === 'phone' || (filter === 'all' && people.length === 0)) {
            const phoneQ = query(
                collection(db, 'users'),
                where('isPhoneVerified', '==', true),
                orderBy('reputation', 'desc'),
                limit(30)
            );
            const phoneSnap = await getDocs(phoneQ);
            phoneSnap.forEach(docSnap => {
                // avoid duplicates
                if (people.some(p => p.uid === docSnap.id)) return;
                const d = docSnap.data();
                people.push({
                    uid: docSnap.id,
                    displayName: d.displayName || d.name || 'Anonymous Witness',
                    photoURL: d.photoURL || null,
                    reputation: d.reputation || 0,
                    zkVerified: !!d.zkVerified,
                    isPhoneVerified: true,
                    bio: d.bio || ''
                });
            });
        }

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
