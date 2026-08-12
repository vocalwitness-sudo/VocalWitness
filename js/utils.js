// js/utils.js
import { db, auth } from './firebase-config.js';
import {
    collection,
    addDoc,
    serverTimestamp,
    query,
    where,
    onSnapshot,
    doc,
    getCountFromServer
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/* ====================== TOAST NOTIFICATION ====================== */
export function showToast(message, type = "success", duration = 3000) {
    const styles = {
        success: { bg: 'bg-emerald-600', icon: '✅' },
        error:   { bg: 'bg-red-600',     icon: '❌' },
        warning: { bg: 'bg-amber-600',   icon: '⚠️' },
        info:    { bg: 'bg-sky-600',     icon: 'ℹ️' }
    };

    const { bg, icon } = styles[type] || styles.success;

    const toast = document.createElement('div');
    toast.className = `
        fixed bottom-5 right-5 p-4 rounded-2xl shadow-2xl z-[100]
        text-white font-medium text-sm flex items-center gap-2
        ${bg} transition-all duration-300 translate-y-0 opacity-100
    `;
    toast.innerHTML = `${icon} ${message}`;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        setTimeout(() => toast.remove(), 350);
    }, duration);
}

/* ====================== DATA & PERFORMANCE ====================== */
export function isLowDataMode() {
    return localStorage.getItem('lowDataMode') === 'true';
}

export function toggleLowDataMode() {
    const current = isLowDataMode();
    localStorage.setItem('lowDataMode', String(!current));
    showToast(!current ? "Low Data Mode Enabled" : "Low Data Mode Disabled", "info");
    setTimeout(() => location.reload(), 800);
}

/* ====================== SAFE ACTION WRAPPER ====================== */
export async function executeAction(actionFn, buttonEl, loadingText = "Processing...") {
    if (!buttonEl || typeof actionFn !== 'function') return;

    const originalContent = buttonEl.innerHTML;
    buttonEl.disabled = true;
    buttonEl.innerHTML = loadingText;

    try {
        await actionFn();
    } catch (error) {
        console.error("Action Failed:", error);
        showToast("Operation failed. Please check your connection.", "error");
    } finally {
        buttonEl.disabled = false;
        buttonEl.innerHTML = originalContent;
    }
}

/* ====================== CRYPTO & FORENSICS ====================== */
export async function generateSha256Hash(input) {
    try {
        const data = (typeof input === 'string')
            ? new TextEncoder().encode(input)
            : await input.arrayBuffer();

        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    } catch (e) {
        console.error("Hash generation failed:", e);
        return null;
    }
}

/* ====================== PEER VOTING ====================== */
export async function submitPeerVote(postId, voteType) {
    if (!postId) return;

    try {
        const votesRef = collection(db, 'votes');
        await addDoc(votesRef, {
            postId,
            voteType, // 'verify' | 'dispute'
            userId: auth.currentUser?.uid || 'anonymous',
            timestamp: serverTimestamp()
        });

        showToast(
            voteType === 'verify'
                ? "✅ Thank you for helping verify truth!"
                : "⚠️ Dispute submitted. Thank you for your vigilance.",
            voteType === 'verify' ? "success" : "warning"
        );
    } catch (error) {
        console.error("Voting failed:", error);
        showToast("❌ Failed to submit vote", "error");
    }
}

/* ====================== REAL-TIME LISTENERS ====================== */

/**
 * Creates a safe unsubscribe function that can be called multiple times
 * without throwing errors.
 */
function createSafeUnsubscribe(unsubscribeFn) {
    let unsubscribed = false;

    return () => {
        if (unsubscribed) return;
        unsubscribed = true;

        try {
            if (typeof unsubscribeFn === 'function') {
                unsubscribeFn();
            }
        } catch (error) {
            console.warn("Error while unsubscribing from Firestore listener:", error);
        }
    };
}

/**
 * Listen to the vote count of a specific post in real-time.
 * Returns a safe unsubscribe function.
 */
export function listenToVoteCount(postId, callback) {
    if (!postId || typeof callback !== 'function') {
        return () => {};
    }

    const q = query(
        collection(db, 'votes'),
        where("postId", "==", postId)
    );

    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            callback(snapshot.size);
        },
        (error) => {
            console.warn("Vote count listener offline/fallback:", error);
            callback(0);
        }
    );

    return createSafeUnsubscribe(unsubscribe);
}

/**
 * Real-time listener for the number of verified citizens.
 * Safe fallback added for slow network/aggregation queries.
 */
export function listenToVerifiedCount(callback) {
    if (typeof callback !== 'function') return () => {};

    const q = query(
        collection(db, "users"),
        where("isVerified", "==", true)
    );

    // Initial count with connection failure handling
    getCountFromServer(q)
        .then((snapshot) => {
            if (snapshot && snapshot.data) {
                callback(snapshot.data().count);
            }
        })
        .catch((err) => {
            console.warn("Server count query skipped due to connection delay:", err);
            // Non-blocking fallback
            callback(0);
        });

    // Real-time updates
    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            callback(snapshot.size);
        },
        (error) => {
            console.warn("Verified count listener operating offline/limited:", error);
        }
    );

    return createSafeUnsubscribe(unsubscribe);
}

/**
 * Listen to how many people requested Live Arena notifications
 */
export function listenToArenaInterest(callback) {
    if (typeof callback !== 'function') return () => {};

    const q = query(
        collection(db, "users"),
        where("interestedInArena", "==", true)
    );

    const unsubscribe = onSnapshot(
        q,
        (snapshot) => callback(snapshot.size),
        (error) => {
            console.warn("Arena interest listener fallback:", error);
            callback(0);
        }
    );

    return createSafeUnsubscribe(unsubscribe);
}

/**
 * Generic real-time document listener
 */
export function listenToDocument(path, callback) {
    if (!path || typeof callback !== 'function') return () => {};

    const ref = doc(db, path);

    const unsubscribe = onSnapshot(
        ref,
        (snap) => {
            if (snap.exists()) {
                callback({ id: snap.id, ...snap.data() });
            } else {
                callback(null);
            }
        },
        (error) => {
            console.warn(`Document listener fallback (${path}):`, error);
            callback(null);
        }
    );

    return createSafeUnsubscribe(unsubscribe);
}

/**
 * Generic real-time collection listener
 */
export function listenToCollection(collectionPath, constraints = [], callback) {
    if (!collectionPath || typeof callback !== 'function') return () => {};

    let q = collection(db, collectionPath);
    if (constraints.length > 0) {
        q = query(q, ...constraints);
    }

    const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
            const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            callback(docs, snapshot);
        },
        (error) => {
            console.warn(`Collection listener fallback (${collectionPath}):`, error);
            callback([], null);
        }
    );

    return createSafeUnsubscribe(unsubscribe);
}

/* ====================== TIER & TRUST SYSTEM ====================== */
export function getTier(trustScore = 0) {
    if (trustScore >= 100) return { name: 'Premium', color: '#FFD700', canDownload: true, badge: '🌟 Verified Truth-Bearer', level: 4 };
    if (trustScore >= 80)  return { name: 'Gold',    color: '#FFD700', canDownload: true, badge: 'Elite Witness',         level: 3 };
    if (trustScore >= 60)  return { name: 'Silver',  color: '#C0C0C0', canDownload: true, badge: 'Trusted Witness',        level: 2 };
    if (trustScore >= 40)  return { name: 'Bronze',  color: '#CD7F32', canDownload: true, badge: 'Verified Citizen',       level: 1 };
    return { name: 'Explorer', color: '#808080', canDownload: false, badge: 'New Citizen', level: 0 };
}

export function calculateTrustScore(userData = {}) {
    const {
        successfulEvidence = 0,
        endorsementsReceived = 0,
        debunkedEvidence = 0,
        testimoniesCount = 0
    } = userData;

    let trust = (successfulEvidence * 5)
              + (endorsementsReceived * 2)
              - (debunkedEvidence * 10)
              + Math.floor(testimoniesCount * 0.5);

    return Math.max(0, Math.min(100, Math.round(trust)));
}

/* ====================== MISC ====================== */
export async function escalatePost(postId) {
    if (!postId) return false;
    showToast("🛡️ Escalating post to Witness Voice review...", "info");
    return true;
}

/* ====================== GLOBAL EXPORTS ====================== */
window.submitPeerVote = submitPeerVote;
window.showToast = showToast;
window.goBack = function () {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = 'index.html';
    }
};
