// js/corroboration.js - Spatio-Temporal Corroboration & "I Saw This Too" Engine
import { auth, db } from './firebase-config.js';
import {
    collection, doc, addDoc, getDocs, query, where,
    orderBy, limit, serverTimestamp, increment, updateDoc,
    getDoc, writeBatch
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { showToast } from './utils.js';
import { canCorroborate, getUserTierWeight } from './tier.js';
import { uploadEvidenceMedia } from './storage.js';
import { computeSHA256 } from './utils.js';
import { notifyCorroboration } from './notifications.js';
import { logAuditEvent } from './audit.js';

const CORROBORATIONS = 'corroborations';
const TESTIMONIES    = 'testimonies';

/**
 * Clustering Threshold Configuration
 */
export const CORROBORATION_CONFIG = {
    TIME_WINDOW_HOURS: 4,          // 4-hour temporal cluster radius
    DISTANCE_RADIUS_KM: 5.0,       // 5km geographic cluster radius
    BASE_TRUST_SCORE: 10,          // Uncorroborated single report baseline score
    CORROBORATED_BOOST_PER_MATCH: 25, // Trust points per distinct corroborated witness
    MAX_TRUST_SCORE: 100,          // Cap score at 100
    CORROBORATION_THRESHOLD: 35    // Minimum trust score required to move out of isolated status
};

/**
 * Submit an explicit "I saw this too" corroboration for a testimony.
 * 
 * @param {string} testimonyId
 * @param {object} opts
 * @param {string} [opts.note]
 * @param {File|Blob|null} [opts.mediaFile]
 * @param {string} [opts.approxTime] - ISO or free text
 * @param {string} [opts.approxLocation]
 * @param {number} [opts.lat]
 * @param {number} [opts.lng]
 * @returns {Promise<string|null>} Created corroboration ID
 */
export async function submitCorroboration(testimonyId, opts = {}) {
    const user = auth.currentUser;
    if (!user) {
        showToast("Sign in required", "error");
        throw new Error("Unauthenticated");
    }

    if (!(await canCorroborate(user))) {
        showToast("Phone verification required to corroborate", "error");
        throw new Error("Insufficient tier");
    }

    // 1. Prevent self-corroboration & double-corroboration
    const existing = await getDocs(query(
        collection(db, CORROBORATIONS),
        where("testimonyId", "==", testimonyId),
        where("authorId", "==", user.uid),
        limit(1)
    ));
    if (!existing.empty) {
        showToast("You already corroborated this report", "info");
        return null;
    }

    const testimonyRef = doc(db, TESTIMONIES, testimonyId);
    const testimonySnap = await getDoc(testimonyRef);
    if (!testimonySnap.exists()) {
        showToast("Report not found", "error");
        throw new Error("Testimony missing");
    }
    const testimony = testimonySnap.data();
    if (testimony.authorId === user.uid) {
        showToast("You cannot corroborate your own report", "error");
        throw new Error("Self-corroboration blocked");
    }

    // 2. Forensic hashing & media upload handling
    let mediaUrl = null;
    let mediaType = null;
    let forensicHash = null;
    if (opts.mediaFile) {
        forensicHash = await computeSHA256(opts.mediaFile);
        mediaType = opts.mediaFile.type.startsWith('audio/') ? 'audio' : 'image';
        mediaUrl = await uploadEvidenceMedia(opts.mediaFile, mediaType);
    }

    const weight = await getUserTierWeight(user); // Tier multiplier: 1, 2, or 3

    const payload = {
        testimonyId,
        authorId: user.uid,
        authorDisplay: user.displayName || "Verified Witness",
        authorTier: weight,
        note: (opts.note || "").trim().slice(0, 280),
        mediaUrl,
        mediaType,
        forensicHash,
        approxTime: opts.approxTime || null,
        approxLocation: opts.approxLocation || null,
        lat: opts.lat ?? null,
        lng: opts.lng ?? null,
        weight,
        createdAt: serverTimestamp(),
        isDeleted: false
    };

    const batch = writeBatch(db);

    // 3. Write corroboration entry
    const corrRef = doc(collection(db, CORROBORATIONS));
    batch.set(corrRef, payload);

    // 4. Calculate dynamic trust score boost
    const newCount = (testimony.corroborationCount || 0) + 1;
    const newScore = (testimony.corroborationScore || 0) + weight;
    const computedTrustScore = Math.min(
        CORROBORATION_CONFIG.MAX_TRUST_SCORE,
        CORROBORATION_CONFIG.BASE_TRUST_SCORE + (newCount * CORROBORATION_CONFIG.CORROBORATED_BOOST_PER_MATCH) + (weight * 5)
    );
    const isCorroborated = computedTrustScore >= CORROBORATION_CONFIG.CORROBORATION_THRESHOLD;

    // Atomically bump counters and status on testimony
    batch.update(testimonyRef, {
        corroborationCount: increment(1),
        corroborationScore: increment(weight),
        trustScore: computedTrustScore,
        corroborationStatus: isCorroborated ? 'corroborated' : 'isolated_unverified',
        lastCorroboratedAt: serverTimestamp()
    });

    await batch.commit();

    // 5. Audit Log Entry
    if (isCorroborated) {
        await logAuditEvent({
            testimonyId,
            eventType: 'CORROBORATION_THRESHOLD_REACHED',
            syntheticScore: testimony.syntheticLikelihood || 0,
            actionTaken: 'trust_score_boosted',
            details: { newCount, newScore, computedTrustScore }
        });
    }

    // 6. High-signal notification to report owner (non-blocking)
    if (testimony.authorId) {
        try {
            await notifyCorroboration(testimony.authorId, user.uid, testimonyId);
        } catch (err) {
            console.warn("Corroboration notification failed (non-fatal):", err);
        }
    }

    showToast("🛡️ Corroboration sealed", "success");
    return corrRef.id;
}

/**
 * Returns live score + count from denormalized testimony fields
 */
export function getCorroborationScoreFromDoc(testimonyData) {
    return {
        count: testimonyData.corroborationCount || 0,
        score: testimonyData.corroborationScore || 0
    };
}

/**
 * Fetch the corroborations list for a testimony detail view or modal
 */
export async function getCorroborations(testimonyId, max = 50) {
    const q = query(
        collection(db, CORROBORATIONS),
        where("testimonyId", "==", testimonyId),
        where("isDeleted", "==", false),
        orderBy("createdAt", "desc"),
        limit(max)
    );
    const snap = await getDocs(q);
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

/**
 * Computes Haversine distance in kilometers between two lat/lng coordinates.
 */
function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = 
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * 
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Spatio-Temporal and content similarity clustering helper
 * Groups testimonies by time window (hours), geo-proximity (5km), forensic hash, or text overlap.
 */
export function clusterTestimonies(testimonies, windowHours = CORROBORATION_CONFIG.TIME_WINDOW_HOURS) {
    const clusters = [];
    const used = new Set();

    for (const t of testimonies) {
        if (used.has(t.id)) continue;
        const cluster = [t];
        used.add(t.id);

        const tTime = t.createdAt?.toMillis?.() || t.clientTimestamp || 0;
        const tLat = t.lat ?? t.location?.latitude;
        const tLng = t.lng ?? t.location?.longitude;

        for (const other of testimonies) {
            if (used.has(other.id)) continue;

            const oTime = other.createdAt?.toMillis?.() || other.clientTimestamp || 0;
            const hoursDiff = Math.abs(tTime - oTime) / 3600000;
            if (hoursDiff > windowHours) continue;

            const oLat = other.lat ?? other.location?.latitude;
            const oLng = other.lng ?? other.location?.longitude;

            // Spatial check (5km radius) if coordinates are available
            let geoMatch = false;
            if (tLat != null && tLng != null && oLat != null && oLng != null) {
                geoMatch = calculateHaversineDistance(tLat, tLng, oLat, oLng) <= CORROBORATION_CONFIG.DISTANCE_RADIUS_KM;
            }

            // Forensic SHA256 Hash match
            const sameHash = t.forensicHash && t.forensicHash === other.forensicHash;
            
            // Textual similarity match
            const contentSim = simpleSimilarity(t.content || t.text || "", other.content || other.text || "");

            if (sameHash || geoMatch || contentSim > 0.45) {
                cluster.push(other);
                used.add(other.id);
            }
        }
        if (cluster.length > 1) clusters.push(cluster);
    }
    return clusters;
}

/**
 * Simple word-set Jaccard similarity fallback calculation
 */
function simpleSimilarity(a, b) {
    const setA = new Set(a.toLowerCase().split(/\s+/).filter(Boolean));
    const setB = new Set(b.toLowerCase().split(/\s+/).filter(Boolean));
    if (setA.size === 0 || setB.size === 0) return 0;
    let inter = 0;
    for (const w of setA) if (setB.has(w)) inter++;
    return inter / Math.max(setA.size, setB.size);
}

/**
 * UI helper – returns HTML for the corroboration action button + score badge
 */
export function renderCorroborationUI(testimony, currentUserCanCorroborate) {
    const { count, score } = getCorroborationScoreFromDoc(testimony);
    const scoreLabel = score > 0 ? `${score} pts · ${count} saw this` : "";

    return `
        <div class="flex items-center gap-2 mt-2">
            <button
                class="corroborate-btn px-3 py-1.5 rounded-full text-xs font-medium
                       ${currentUserCanCorroborate
                         ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30'
                         : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'}"
                data-testimony-id="${testimony.id}"
                ${currentUserCanCorroborate ? '' : 'disabled'}
                title="${currentUserCanCorroborate ? 'I saw this too' : 'Phone verification required'}">
                👁️ I saw this too
            </button>
            ${score > 0 ? `
                <span class="text-[11px] text-emerald-400/90 font-medium tracking-tight">
                    ${scoreLabel}
                </span>` : ''}
        </div>
    `;
}
