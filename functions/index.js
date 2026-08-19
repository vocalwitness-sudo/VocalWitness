// ======================================================
// 7. RATE LIMITING (TRANSACTION-BASED) – SECURE CALLABLE
// ======================================================
exports.checkRateLimit = onCall(
  {
    enforceAppCheck: true,          // ← blocks requests without valid App Check token
    // consumeAppCheckToken: false, // set true only if you want one-time tokens
  },
  async (request) => {
    // Authentication is optional for rate limiting (you can force it if desired)
    let userId = null;

    if (request.auth) {
      userId = request.auth.uid;
    } else {
      // Fallback for unauthenticated users (use a stable identifier if possible)
      // In a real app you might use a fingerprint or just reject
      userId = "anonymous_" + (request.rawRequest?.ip || "unknown").replace(/[.:]/g, "_");
    }

    const action = request.data?.action || "general_action";
    const maxCalls = Number(request.data?.maxCalls) || 5;
    const windowMinutes = Number(request.data?.windowMinutes) || 60;

    if (typeof action !== "string" || action.length > 64) {
      throw new HttpsError("invalid-argument", "Invalid action name.");
    }

    const rateDocRef = db.collection("rateLimits").doc(`${userId}_${action}`);

    try {
      const isAllowed = await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(rateDocRef);
        const now = admin.firestore.Timestamp.now();
        const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

        if (!doc.exists) {
          transaction.set(rateDocRef, {
            count: 1,
            firstRequest: now,
            lastRequest: now,
          });
          return true;
        }

        const docData = doc.data();

        if (docData.lastRequest.toDate() < windowStart) {
          transaction.set(rateDocRef, {
            count: 1,
            firstRequest: now,
            lastRequest: now,
          });
          return true;
        }

        if (docData.count >= maxCalls) {
          return false;
        }

        transaction.update(rateDocRef, {
          count: admin.firestore.FieldValue.increment(1),
          lastRequest: now,
        });

        return true;
      });

      return { allowed: isAllowed };
    } catch (error) {
      console.error("Rate limit check failed:", error);
      // Fail-open (same behaviour you had)
      return { allowed: true };
    }
  }
);
