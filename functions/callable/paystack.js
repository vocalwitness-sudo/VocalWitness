/**
 * functions/callable/paystack.js
 * One-time support initialization (Paystack)
 */
import { onCall, HttpsError } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import { enforceRateLimit } from "../lib/rate-limit.js";

/**
 * Factory – same pattern as phone / ban / claims.
 * @param {{ allowedOrigins: string[], db: FirebaseFirestore.Firestore, paystackSecretKey: any, getPaystackClient: () => any }} deps
 */
export function createInitializePaystack({
  allowedOrigins,
  db,
  paystackSecretKey,
  getPaystackClient,
}) {
  return onCall(
    {
      cors: allowedOrigins,
      secrets: [paystackSecretKey],
      // enforceAppCheck: true,  // enable when ready
    },
    async (request) => {
      if (!request.auth) {
        throw new HttpsError(
          "unauthenticated",
          "Sign in required to support the Square."
        );
      }

      await enforceRateLimit(request.auth.uid, "initializePaystack", {
        windowMs: 60_000,
        max: 8,
      });

      const { amount, currency = "NGN", note = "" } = request.data || {};
      const major = Number(amount);
      const cur = String(currency || "NGN").toUpperCase();

      // NGN minimum 1000, USD minimum 5
      const minMajor = cur === "USD" ? 5 : 1000;
      if (!Number.isFinite(major) || major < minMajor) {
        throw new HttpsError(
          "invalid-argument",
          `Amount must be at least ${minMajor} ${cur}.`
        );
      }

      const uid = request.auth.uid;
      const email =
        request.auth.token.email ||
        `supporter+${uid.slice(0, 8)}@vocalwitness.app`;

      const reference = `VW_${Date.now()}_${uid.slice(0, 6)}_${Math.floor(
        Math.random() * 100000
      )}`;
      const amountSubunit = Math.round(major * 100);

      try {
        await db.collection("supporters").doc(reference).set({
          reference,
          userId: uid,
          status: "pending",
          provider: "paystack",
          type: "one_time",
          email,
          amount: major,
          amountSubunit,
          currency: cur,
          note: String(note || "").slice(0, 200),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          completedAt: null,
          metadata: {},
        });

        const paystack = getPaystackClient();
        const transaction = await paystack.transaction.initialize({
          amount: amountSubunit,
          email,
          reference,
          currency: cur,
          metadata: {
            userId: uid,
            type: "one_time_support",
            platform: "vocalwitness",
          },
          callback_url: "https://vocalwitness.com/?support=success",
        });

        return {
          authorization_url: transaction.data.authorization_url,
          access_code: transaction.data.access_code,
          reference: transaction.data.reference,
        };
      } catch (error) {
        console.error("Paystack init error:", error);
        if (error instanceof HttpsError) throw error;
        throw new HttpsError(
          "internal",
          "Could not start payment. Try again."
        );
      }
    }
  );
}
