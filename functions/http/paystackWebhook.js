/**
 * functions/http/paystackWebhook.js
 * Paystack charge.success webhook
 */
import { onRequest } from "firebase-functions/v2/https";
import admin from "firebase-admin";
import crypto from "crypto";
import { writeAuditLog } from "../lib/audit.js";

/**
 * @param {{ db: any, paystackSecretKey: any }} deps
 */
export function createPaystackWebhook({ db, paystackSecretKey }) {
  return onRequest(
    {
      cors: false,
      secrets: [paystackSecretKey],
    },
    async (req, res) => {
      if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
      }

      const secret = paystackSecretKey.value();
      const signature = req.headers["x-paystack-signature"];

      if (!signature || typeof signature !== "string") {
        return res.status(400).send("Missing signature");
      }
      if (!req.rawBody) {
        return res.status(400).send("Missing raw body");
      }

      // Verify signature (timing-safe)
      const expectedHash = crypto
        .createHmac("sha512", secret)
        .update(req.rawBody)
        .digest("hex");

      const sigBuf = Buffer.from(signature);
      const hashBuf = Buffer.from(expectedHash);
      if (
        sigBuf.length !== hashBuf.length ||
        !crypto.timingSafeEqual(sigBuf, hashBuf)
      ) {
        console.error("Invalid Paystack webhook signature");
        return res.status(400).send("Invalid signature");
      }

      const event = req.body;
      if (event?.event !== "charge.success") {
        return res.status(200).send("Ignored");
      }

      const data = event.data || {};
      const reference = data.reference;
      const userId = data.metadata?.userId;
      const amountMajor = (data.amount || 0) / 100;
      const currency = String(data.currency || "NGN").toUpperCase();

      if (!reference || !userId) {
        console.warn(
          "Paystack success missing reference or userId",
          reference,
          userId
        );
        return res.status(200).send("Missing metadata");
      }

      try {
        const supportRef = db.collection("supporters").doc(String(reference));

        // Idempotency: do not re-process completed payments
        const existing = await supportRef.get();
        if (existing.exists && existing.data()?.status === "completed") {
          return res.status(200).send("Already processed");
        }

        await supportRef.set(
          {
            reference: String(reference),
            userId: String(userId),
            status: "completed",
            paymentId: String(data.id || data.reference),
            amount: amountMajor,
            amountSubunit: data.amount,
            currency,
            provider: "paystack",
            type: "one_time",
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            rawChannel: data.channel || null,
          },
          { merge: true }
        );

        await db.collection("users").doc(String(userId)).set(
          {
            isSupporter: true,
            supporterTier: "supporter",
            supporterSince: admin.firestore.FieldValue.serverTimestamp(),
            totalContributed:
              admin.firestore.FieldValue.increment(amountMajor),
            lastSupportAt: admin.firestore.FieldValue.serverTimestamp(),
            lastSupportRef: String(reference),
          },
          { merge: true }
        );

        const userRecord = await admin.auth().getUser(String(userId));
        const currentClaims = userRecord.customClaims || {};
        await admin.auth().setCustomUserClaims(String(userId), {
          ...currentClaims,
          supporter: true,
        });

        await writeAuditLog({
          action: "supporter_granted",
          performedBy: "system",
          targetId: String(userId),
          targetType: "user",
          details: {
            amount: amountMajor,
            currency,
            reference: String(reference),
            provider: "paystack",
          },
          severity: "info",
        });

        return res.status(200).send("OK");
      } catch (err) {
        console.error("Paystack webhook processing error:", err);
        return res.status(500).send("Processing error");
      }
    }
  );
}
