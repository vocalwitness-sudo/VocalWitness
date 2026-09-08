// js/circle.js - My Circle / Trusted Voices (Updated to v11.0.0)

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
    // people whose posts should appear in "Witness Voice" feed
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
    // optional mirror on target (best-effort)
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
    _cache.trusted = _cache.trusted.filter(id => id !== targetUid); // drop trust if unfollowed
    return true;
}

/** Mark as Trusted (must already follow, or auto-follow) */
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

/** Simple empty-state copy helper for feed UI */
export function circleEmptyMessage() {
    return 'Follow voices you trust to build your high-signal feed.';
}
