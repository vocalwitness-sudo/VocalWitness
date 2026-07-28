// js/audit.js - Forensic Tracking & Immutable Audit Log
import { db, auth } from './firebase-config.js';
import { collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/**
 * Generates a SHA-256 forensic hash for any string data or payload.
 * Useful for verifying integrity of testimonies, audit logs, and actions.
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
 * Records an immutable audit log entry into Firestore with a cryptographic hash.
 * 
 * @param {string} actionType - The type of action being logged (e.g., "REPORT_CONTENT", "MODERATE_POST", "ZK_VERIFY")
 * @param {string} targetId - The ID of the document or user being targeted/affected
 * @param {Object} details - Additional metadata or context for the action
 */
export async function logSecurityAudit(actionType, targetId, details = {}) {
    try {
        const userId = auth.currentUser ? auth.currentUser.uid : 'anonymous';
        const timestamp = Date.now();
        
        const payloadString = JSON.stringify({ userId, actionType, targetId, details, timestamp });
        const forensicHash = await generateForensicHash(payloadString);

        await addDoc(collection(db, "audit_logs"), {
            userId,
            actionType,
            targetId,
            details,
            forensicHash,
            createdAt: serverTimestamp()
        });

        console.log(`🛡️ Audit Log Recorded [${actionType}]:`, forensicHash ? forensicHash.substring(0, 12) + '...' : 'no-hash');
        return forensicHash;
    } catch (e) {
        console.error("Failed to record audit log:", e);
        return null;
    }
}
