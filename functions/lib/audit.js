/**
 * functions/lib/audit.js
 * Central audit logging for VocalWitness
 */
import admin from "firebase-admin";

// Ensure admin is initialized by the caller (index.js or admin.js)
const db = () => admin.firestore();

/**
 * Write a structured audit log entry.
 * Never throws to the caller — logging failure must not break business logic.
 */
export async function writeAuditLog({
  action,
  performedBy,
  targetId = null,
  targetType = null,
  details = {},
  severity = "info",
}) {
  try {
    await db().collection("audit_logs").add({
      action: String(action),
      performedBy: String(performedBy),
      targetId: targetId ? String(targetId) : null,
      targetType: targetType ? String(targetType) : null,
      details: details && typeof details === "object" ? details : {},
      severity: String(severity),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[audit] Failed to write audit log:", error?.message || error);
  }
}
