// js/audit.js - Forensic Tracking & Immutable Audit Log
import { db, auth } from './firebase-config.js';
import { collection, addDoc, doc, setDoc, updateDoc, serverTimestamp, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

// In-memory hash tracking to eliminate Firestore fetch delays between consecutive actions
let memoryLastHash = null;

/**
 * Deterministically sorts object keys to ensure reliable hashing across platforms.
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
        console.warn("Could not retrieve previous log hash, starting fresh chain link:", e);
    }
    return "GENESIS_BLOCK";
}

/**
 * Records a cryptographically chained audit log entry into Firestore.
 */
export async function logSecurityAudit(actionType, targetId, details = {}) {
    try {
        const userId = auth.currentUser ? auth.currentUser.uid : 'anonymous';
        const timestamp = Date.now();
        const previousHash = await getLastLogHash();

        // Standardized canonical payload
        const canonicalPayload = canonicalizeJSON({
            actionType,
            details,
            previousHash,
            targetId,
            timestamp,
            userId
        });

        const forensicHash = await generateForensicHash(canonicalPayload);
        memoryLastHash = forensicHash; // Update memory cache

        await addDoc(collection(db, "audit_logs"), {
            userId,
            actionType,
            targetId,
            details,
            previousHash,
            forensicHash,
            clientTimestamp: timestamp,
            createdAt: serverTimestamp()
        });

        console.log(`🛡️ Audit Log Chained [${actionType}]:`, forensicHash ? `${forensicHash.substring(0, 12)}...` : 'no-hash');
        return forensicHash;
    } catch (e) {
        console.error("Failed to record audit log:", e);
        return null;
    }
}

/* ==========================================================================
   AI FLAG AUDIT LOGS & APPEAL WORKFLOWS
   ========================================================================== */

const AI_FLAG_COLLECTION = 'ai_flag_audit_logs';

/**
 * Records cryptographic content hashes, timestamp entries, and confidence scores when media is marked synthetic.
 */
export async function logAIFlaggedContent({ mediaHash, confidenceScore, detectorModel = 'Synthetic Detector Engine', details = {} }) {
    try {
        const userId = auth.currentUser ? auth.currentUser.uid : 'anonymous';
        const timestamp = Date.now();

        const auditEntry = {
            mediaHash,
            confidenceScore: parseFloat(confidenceScore.toFixed(4)),
            detectorModel,
            userId,
            status: 'QUARANTINED',
            details,
            clientTimestamp: timestamp,
            createdAt: serverTimestamp()
        };

        // Add to AI-specific flag audit log collection
        const docRef = doc(db, AI_FLAG_COLLECTION, mediaHash);
        await setDoc(docRef, auditEntry, { merge: true });

        // Chain into global forensic security chain
        await logSecurityAudit('AI_SYNTHETIC_MEDIA_FLAGGED', mediaHash, {
            confidenceScore: auditEntry.confidenceScore,
            detectorModel
        });

        console.log(`⚠️ [AI Flag Logged] Hash: ${mediaHash} | Score: ${confidenceScore}`);
        return auditEntry;
    } catch (e) {
        console.error("Failed to log AI flag audit:", e);
        return null;
    }
}

/**
 * Fetches recent AI flag audit logs for transparency views.
 */
export async function fetchAIFlagAuditLogs(limitCount = 50) {
    try {
        const q = query(collection(db, AI_FLAG_COLLECTION), orderBy("clientTimestamp", "desc"), limit(limitCount));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
    } catch (e) {
        console.error("Error fetching AI flag audit logs:", e);
        return [];
    }
}

/**
 * Allows users to challenge false positives by submitting an appeal for community/admin review.
 */
export async function submitFlagAppeal(mediaHash, justification) {
    try {
        const userId = auth.currentUser ? auth.currentUser.uid : 'anonymous';
        const docRef = doc(db, AI_FLAG_COLLECTION, mediaHash);

        const appealData = {
            status: 'APPEAL_PENDING',
            appealSubmittedAt: serverTimestamp(),
            appealUserId: userId,
            justification
        };

        await updateDoc(docRef, appealData);

        await logSecurityAudit('AI_FLAG_APPEAL_SUBMITTED', mediaHash, { justification });

        console.log(`⚖️ [Appeal Submitted] Hash: ${mediaHash}`);
        return true;
    } catch (e) {
        console.error("Failed to submit appeal:", e);
        return false;
    }
}
