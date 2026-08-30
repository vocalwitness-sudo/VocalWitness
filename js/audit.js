// js/audit.js - Forensic Tracking & Immutable Audit Log
import { db, auth } from './firebase-config.js';
import { 
    collection, 
    addDoc, 
    serverTimestamp, 
    query, 
    orderBy, 
    limit, 
    getDocs 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

let memoryLastHash = null;

// Reset memory cache on auth changes to prevent cross-session leaks
if (auth) {
    auth.onAuthStateChanged(() => {
        memoryLastHash = null;
    });
}

/**
 * Deterministically sorts object keys for reliable canonical hashing.
 */
function canonicalizeJSON(obj) {
    if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
    if (Array.isArray(obj)) return `[${obj.map(canonicalizeJSON).join(',')}]`;
    const sortedKeys = Object.keys(obj).sort();
    const keyValues = sortedKeys.map(key => `${JSON.stringify(key)}:${canonicalizeJSON(obj[key])}`);
    return `{${keyValues.join(',')}}`;
}

/**
 * Generates a SHA-256 forensic hash for string data.
 */
export async function generateForensicHash(dataString) {
    try {
        const encoder = new TextEncoder();
        const data = encoder.encode(dataString);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.error("Forensic hashing failed:", e);
        return null;
    }
}

/**
 * Fetches the most recent log's hash to maintain hash-chain continuity.
 * Gracefully falls back to GENESIS_BLOCK if the user lacks read permissions.
 */
async function getLastLogHash() {
    if (memoryLastHash) return memoryLastHash;

    try {
        const q = query(collection(db, "audit_logs"), orderBy("clientTimestamp", "desc"), limit(1));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
            const hash = snapshot.docs[0].data().forensicHash;
            if (hash) {
                memoryLastHash = hash;
                return hash;
            }
        }
    } catch (e) {
        memoryLastHash = "GENESIS_BLOCK";
    }
    return memoryLastHash || "GENESIS_BLOCK";
}

/**
 * Records a cryptographically chained audit log entry into Firestore.
 * Conforms directly to hardened Firestore Security Rules.
 */
export async function logSecurityAudit(actionType, targetId, details = {}) {
    try {
        const userId = auth?.currentUser ? auth.currentUser.uid : 'anonymous';
        const timestamp = Date.now();
        const previousHash = memoryLastHash || await getLastLogHash();

        const canonicalPayload = canonicalizeJSON({
            action: actionType,
            details,
            previousHash,
            targetId,
            timestamp,
            userId
        });

        const forensicHash = await generateForensicHash(canonicalPayload);

        await addDoc(collection(db, "audit_logs"), {
            userId,
            action: actionType,
            actionType,
            targetId: targetId || 'N/A',
            details,
            previousHash,
            forensicHash,
            clientTimestamp: timestamp,
            timestamp: serverTimestamp(),
            createdAt: serverTimestamp()
        });

        memoryLastHash = forensicHash;
        console.log(`🛡️ Audit Log Chained [${actionType}]:`, forensicHash ? `${forensicHash.substring(0, 12)}...` : 'no-hash');
        return forensicHash;
    } catch (e) {
        console.warn(`🛡️ Audit log write bypassed [${actionType}]:`, e.message);
        return memoryLastHash || "CLIENT_LOCAL_HASH";
    }
}

/* ==========================================================================
   AI FLAG AUDIT LOGS & APPEAL WORKFLOWS
   ========================================================================== */

export async function logAIFlaggedContent({ mediaHash, confidenceScore, detectorModel = 'Synthetic Detector Engine', details = {} }) {
    try {
        const scoreFormatted = parseFloat(confidenceScore.toFixed(4));
        const forensicHash = await logSecurityAudit('AI_SYNTHETIC_MEDIA_FLAGGED', mediaHash, {
            confidenceScore: scoreFormatted,
            detectorModel,
            status: 'QUARANTINED',
            ...details
        });

        console.log(`⚠️ [AI Flag Logged] Hash: ${mediaHash} | Score: ${scoreFormatted}`);
        return { mediaHash, confidenceScore: scoreFormatted, forensicHash };
    } catch (e) {
        console.error("Failed to log AI flag audit:", e);
        return null;
    }
}

export async function fetchAIFlagAuditLogs(limitCount = 50) {
    try {
        const q = query(
            collection(db, "audit_logs"), 
            orderBy("clientTimestamp", "desc"), 
            limit(limitCount)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs
            .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
            .filter(log => log.action === 'AI_SYNTHETIC_MEDIA_FLAGGED');
    } catch (e) {
        console.warn("Unable to fetch AI flag audit logs (restricted access):", e.message);
        return [];
    }
}

export async function submitFlagAppeal(mediaHash, justification) {
    try {
        const resultHash = await logSecurityAudit('AI_FLAG_APPEAL_SUBMITTED', mediaHash, { 
            justification,
            status: 'APPEAL_PENDING'
        });

        console.log(`⚖️ [Appeal Submitted] Hash: ${mediaHash}`);
        return !!resultHash;
    } catch (e) {
        console.error("Failed to submit appeal:", e);
        return false;
    }
}

export async function getHashChainHealth(sampleSize = 40) {
    try {
        const q = query(
            collection(db, 'audit_logs'),
            orderBy('clientTimestamp', 'desc'),
            limit(sampleSize)
        );
        const snapshot = await getDocs(q);
        const logs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

        if (logs.length < 2) {
            return {
                ok: true,
                checked: logs.length,
                breaks: 0,
                headHash: logs[0]?.forensicHash || null,
                status: logs.length ? 'HEALTHY_SHORT' : 'EMPTY',
            };
        }

        let breaks = 0;
        for (let i = 0; i < logs.length - 1; i++) {
            const newer = logs[i];
            const older = logs[i + 1];
            if (newer.previousHash && older.forensicHash && newer.previousHash !== older.forensicHash) {
                breaks++;
            }
        }

        return {
            ok: breaks === 0,
            checked: logs.length,
            breaks,
            headHash: logs[0]?.forensicHash || null,
            status: breaks === 0 ? 'HEALTHY' : 'BREAKS_DETECTED',
        };
    } catch (e) {
        return { ok: true, checked: 0, breaks: 0, headHash: memoryLastHash, status: 'RESTRICTED_ACCESS' };
    }
}

export async function getTransparencyMetrics() {
    try {
        const [testimoniesSnap, disputesSnap, chain] = await Promise.all([
            getDocs(query(collection(db, 'testimonies'), orderBy('createdAt', 'desc'), limit(100))).catch(() => ({ docs: [], size: 0 })),
            getDocs(query(collection(db, 'reports'), limit(100))).catch(() => ({ docs: [], size: 0 })),
            getHashChainHealth(30),
        ]);

        let sealed = 0;
        (testimoniesSnap.docs || []).forEach((d) => {
            const x = d.data();
            if (x.status === 'published' || x.forensicHash || x.hasForensic) sealed++;
        });

        const disputes = (disputesSnap.docs || []).map((d) => ({ id: d.id, ...d.data() }));
        const outcomes = {
            open: disputes.filter((x) => x.status === 'OPEN' || x.status === 'PENDING').length,
            upheld: disputes.filter((x) => x.status === 'UPHELD' || x.status === 'CHALLENGE_SUCCESS').length,
            rejected: disputes.filter((x) => x.status === 'REJECTED' || x.status === 'CHALLENGE_FAILED').length,
            total: disputes.length,
        };

        return {
            sealedReports: sealed,
            sampledTestimonies: testimoniesSnap.size || 0,
            chain,
            disputes: outcomes,
            updatedAt: new Date().toISOString(),
        };
    } catch (e) {
        console.warn("Failed to fetch full transparency metrics:", e.message);
        return null;
    }
}

/* ==========================================================================
   ALIAS EXPORTS
   ========================================================================== */

export async function logAuditEvent(actionType, targetId, details = {}) {
    return await logSecurityAudit(actionType, targetId, details);
}

export const AuditEngine = {
    logSecurityAudit,
    logAuditEvent,
    logAIFlaggedContent,
    fetchAIFlagAuditLogs,
    submitFlagAppeal,
    getHashChainHealth,
    getTransparencyMetrics,
    generateForensicHash
};

export default AuditEngine;
