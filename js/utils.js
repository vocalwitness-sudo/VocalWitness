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
    getDoc
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

    // Animate out
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

    // Optional: require authentication
    // if (!auth.currentUser) {
    //     showToast("Please sign in to vote", "info");
    //     return;
    // }

    try {
        const votesRef = collection(db, 'votes');
        await addDoc(votesRef, {
            postId,
            voteType,                       // 'verify' | 'dispute'
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
 * Listen to the vote count of a specific post in real-time.
 * Returns an unsubscribe function.
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
            console.error("Vote count listener error:", error);
            callback(0);
        }
    );

    return unsubscribe;
}

/**
 * Generic real-time document listener
 * @param {string} path - e.g. "users/uid123"
 * @param {(data: object|null) => void} callback
 * @returns {() => void} unsubscribe
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
            console.error(`Document listener error (${path}):`, error);
            callback(null);
        }
    );

    return unsubscribe;
}

/**
 * Generic real-time collection listener
 * @param {string} collectionPath
 * @param {Array} constraints - array of where()/orderBy() etc.
 * @param {(docs: array, snapshot) => void} callback
 * @returns {() => void} unsubscribe
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
            console.error(`Collection listener error (${collectionPath}):`, error);
            callback([], null);
        }
    );

    return unsubscribe;
}

/* ====================== TIER & TRUST SYSTEM ====================== */
export function getTier(trustScore = 0) {
    if (trustScore >= 100) return { name: 'Premium', color: '#FFD700', canDownload: true, badge: '🌟 Verified Truth-Bearer', level: 4 };
    if (trustScore >= 80)  return { name: 'Gold',    color: '#FFD700', canDownload: true, badge: 'Elite Witness',          level: 3 };
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
    showToast("🛡️ Escalating post to True Witness review...", "info");
    // You can expand this later to write to an "escalations" collection
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
