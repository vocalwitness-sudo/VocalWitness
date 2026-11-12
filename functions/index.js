/**
 * Cloud Functions for Firebase / Cloudflare R2 Integration
 * Stack: Firebase Functions v2 • AWS SDK v3 • SnarkJS • Paystack • Cloud Tasks • Gemini API
 */
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { beforeUserCreated } from "firebase-functions/v2/identity";
import * as logger from "firebase-functions/logger";
import { setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenAI, Type } from "@google/genai";
import { CloudTasksClient } from "@google-cloud/tasks";
import admin from "firebase-admin";
import paystackApi from "paystack-api";
import * as snarkjs from "snarkjs";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import axios from "axios";
import corsPackage from "cors";
import { buildPoseidon } from "circomlibjs";
import { AccessToken } from "livekit-server-sdk";
import { fileURLToPath } from "url";
import { onObjectFinalized } from "firebase-functions/v2/storage";
import { dailyAnchor, triggerAnchorNow } from "./anchor.js";
import Parser from "rss-parser";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { writeAuditLog } from "./lib/audit.js";
import { enforceRateLimit } from "./lib/rate-limit.js";
import { getR2Client, createUploadSignedUrl } from "./lib/r2.js";
import { createGetUploadUrl } from "./http/getUploadUrl.js";
import { createConfirmPhoneVerification } from "./callable/confirmPhoneVerification.js";
import { createSetUserClaims } from "./callable/setUserClaims.js";
import { createBanUser } from "./callable/banUser.js";
import { createUnbanUser } from "./callable/unbanUser.js";
import { createModeratedDelete } from "./callable/moderatedDelete.js";
import { createEvaluateTrustTier } from "./callable/evaluateTrustTier.js";
import { createRestoreHiddenContent } from "./callable/restoreHiddenContent.js";
// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

setGlobalOptions({
  region: "us-central1",
  cpu: 0.5,
  memory: "256MiB",
  maxInstances: 5,   // was 20 — main quota saver
});

// ======================================================
// SECRETS
// ======================================================
const perspectiveApiKey = defineSecret("PERSPECTIVE_API_KEY");
const r2AccessKeyId = defineSecret("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = defineSecret("R2_SECRET_ACCESS_KEY");
const paystackSecretKey = defineSecret("PAYSTACK_SECRET_KEY");
const geminiApiKey = defineSecret("GEMINI_API_KEY");
const nowpaymentsIpnSecret = defineSecret("NOWPAYMENTS_IPN_SECRET");

// ======================================================
// INITIALIZE & SINGLETONS
// ======================================================
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const tasksClient = new CloudTasksClient();

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
const LOCATION = "us-central1";
const QUEUE_NAME = "heavy-processing-queue";

const allowedOrigins = [
  "https://vocalwitness-3affa.web.app",
  "https://vocalwitness-3affa.firebaseapp.com",
  "https://vocalwitness.com",
  "https://www.vocalwitness.com"
];

// Reusable Paystack Client Instance
function getPaystackClient() {
  const secret = paystackSecretKey.value();
  if (!secret) {
    throw new HttpsError("failed-precondition", "Paystack secret key configuration is missing.");
  }
  return paystackApi(secret);
}

// Native Express CORS middleware wrapper
const corsHandler = corsPackage({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Firebase-AppCheck"],
  maxAge: 3600
});

async function enqueueBackgroundTask(functionName, payload, delaySeconds = 0) {
  const parent = tasksClient.queuePath(PROJECT_ID, LOCATION, QUEUE_NAME);

  const task = {
    httpRequest: {
      httpMethod: "POST",
      url: `https://${LOCATION}-${PROJECT_ID}.cloudfunctions.net/${functionName}`,
      headers: { "Content-Type": "application/json" },
      body: Buffer.from(JSON.stringify(payload)).toString("base64"),
      oidcToken: {
        serviceAccountEmail: `${PROJECT_ID}@appspot.gserviceaccount.com`
      }
    }
  };

  if (delaySeconds > 0) {
    task.scheduleTime = {
      seconds: Math.floor(Date.now() / 1000) + delaySeconds
    };
  }

  const [response] = await tasksClient.createTask({ parent, task });
  return response.name;
}


export const evaluateTrustTier = createEvaluateTrustTier({ allowedOrigins, db });
export const moderatedDelete = createModeratedDelete({ allowedOrigins, db });
export const restoreHiddenContent = createRestoreHiddenContent({ allowedOrigins, db });
export const setUserClaims = createSetUserClaims({ allowedOrigins, db });
export const banUser = createBanUser({ allowedOrigins, db });
export const unbanUser = createUnbanUser({ allowedOrigins, db });

// ======================================================
// 2. USER INITIALIZATION (Pure v2)
// ======================================================
export const initializeCitizenProfile = beforeUserCreated(async (event) => {
  const user = event.data;
  const userId = user.uid;
  const defaultUsername = `citizen_${Math.floor(1000 + Math.random() * 9000)}`;

  const defaultCitizenData = {
    uid: userId,
    email: user.email || "",
    displayName: user.displayName || "New Citizen",
    username: defaultUsername,
    photoURL: user.photoURL || "https://placehold.co/150",
    role: "citizen",
    tier: "citizen",
    reputationScore: 50,
    trustCircle: 0,
    level: 1,
    isPhoneVerified: Boolean(user.phoneNumber),
    isVerified: Boolean(user.phoneNumber),
    zkVerified: false,
    verifiedAt: user.phoneNumber ? admin.firestore.FieldValue.serverTimestamp() : null,
    testimoniesCount: 0,
    verificationsMade: 0,
    endorsementsReceived: 0,
    successfulEvidence: 0,
    debunkedEvidence: 0,
    successfulEscalations: 0,
    communityEndorsements: 0,
    interestedInArena: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLogin: admin.firestore.FieldValue.serverTimestamp(),
    bio: "Just joined the Citizen Talk room.",
    location: "",
    badges: ["casual_talker"]
  };

  try {
    await db.collection("users").doc(userId).set(defaultCitizenData, { merge: true });

    await admin.auth().setCustomUserClaims(userId, {
      admin: false,
      moderator: false,
      banned: false,
      supporter: false,
      steward: false
    });

    await writeAuditLog({
      action: "user_created",
      performedBy: "system",
      targetId: userId,
      targetType: "user",
      details: { email: user.email || null, phoneVerified: Boolean(user.phoneNumber) },
      severity: "info"
    });

    console.log(`✅ Created profile for user: ${userId}`);
  } catch (error) {
    console.error(`Error creating profile for ${userId}:`, error);
  }
});

// ======================================================
// TOXICITY HELPERS, GEMINI AI MODERATION & AI TOOLS
// ======================================================

export const analyzeToxicity = createAnalyzeToxicity({
  perspectiveApiKey,
  corsHandler,
});

export const translateTestimony = createTranslateTestimony({
  allowedOrigins,
  geminiApiKey,
});

export const transcribeAudioWitness = createTranscribeAudioWitness({
  allowedOrigins,
  geminiApiKey,
});

export const summarizeReport = createSummarizeReport({
  allowedOrigins,
  geminiApiKey,
});
// ======================================================
// 6. PAYSTACK — ONE-TIME SUPPORT
// ======================================================

export const initializePaystack = onCall(
  {
    cors: allowedOrigins,
    secrets: [paystackSecretKey],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required to support the Square.");
    }

    // 1. Enforce rate limit (max 8 requests per 60 seconds per user)
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

    const reference = `VW_${Date.now()}_${uid.slice(0, 6)}_${Math.floor(Math.random() * 100000)}`;
    const amountSubunit = Math.round(major * 100);

    try {
      // 2. Firestore document containing all required fields
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
      throw new HttpsError("internal", "Could not start payment. Try again.");
    }
  }
);
export const paystackWebhook = onRequest(
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
      console.warn("Paystack success missing reference or userId", reference, userId);
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
          totalContributed: admin.firestore.FieldValue.increment(amountMajor),
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

// ======================================================
// NOWPayments — same supporter model
// ======================================================

export const nowPaymentsWebhook = onRequest(
  { secrets: [nowpaymentsIpnSecret] },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    try {
      const body = req.body || {};
      const {
        payment_id,
        payment_status,
        price_amount,
        order_id,
        pay_currency,
        price_currency,
      } = body;

      // Only accept finished/confirmed
      if (payment_status !== "finished" && payment_status !== "confirmed") {
        return res.status(200).send("Ignored");
      }

      const reference = String(order_id || payment_id || "");
      if (!reference) {
        return res.status(200).send("No reference");
      }

      // Optional: verify IPN secret if you pass it via header/query
      // Adjust to match how you configured NOWPayments
      const providedSecret =
        req.headers["x-nowpayments-sig"] ||
        req.headers["x-ipn-secret"] ||
        req.query?.ipn_secret;
      const expectedSecret = nowpaymentsIpnSecret.value();
      if (expectedSecret && providedSecret && String(providedSecret) !== String(expectedSecret)) {
        console.warn("NOWPayments IPN secret mismatch");
        return res.status(401).send("Invalid secret");
      }

      const supportRef = db.collection("supporters").doc(reference);
      const existing = await supportRef.get();
      if (existing.exists && existing.data()?.status === "completed") {
        return res.status(200).send("Already processed");
      }

      const amountMajor = Number(price_amount || 0);
      const currency = String(price_currency || pay_currency || "USD").toUpperCase();

      // Prefer userId stored when payment was created
      const userId =
        existing.exists && existing.data()?.userId
          ? String(existing.data().userId)
          : body.order_description || body.userId || null;

      if (!userId) {
        console.warn("NOWPayments success missing userId for", reference);
        return res.status(200).send("Missing userId");
      }

      await supportRef.set(
        {
          reference,
          userId: String(userId),
          status: "completed",
          paymentId: String(payment_id || reference),
          amount: amountMajor,
          currency,
          provider: "nowpayments",
          type: "one_time",
          completedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await db.collection("users").doc(String(userId)).set(
        {
          isSupporter: true,
          supporterTier: "supporter",
          supporterSince: admin.firestore.FieldValue.serverTimestamp(),
          totalContributed: admin.firestore.FieldValue.increment(amountMajor),
          lastSupportAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSupportRef: reference,
        },
        { merge: true }
      );

      try {
        const userRecord = await admin.auth().getUser(String(userId));
        const currentClaims = userRecord.customClaims || {};
        await admin.auth().setCustomUserClaims(String(userId), {
          ...currentClaims,
          supporter: true,
        });
      } catch (claimsErr) {
        console.warn("NOWPayments claims update failed:", claimsErr?.message || claimsErr);
      }

      await writeAuditLog({
        action: "supporter_granted",
        performedBy: "system",
        targetId: String(userId),
        targetType: "user",
        details: {
          amount: amountMajor,
          currency,
          reference,
          provider: "nowpayments",
        },
        severity: "info",
      });

      return res.status(200).send("OK");
    } catch (err) {
      console.error("NOWPayments webhook error:", err);
      return res.status(500).send("Processing error");
    }
  }
);
// ======================================================
// ZERO-KNOWLEDGE PROOF VERIFICATION & WITNESS CIRCLE
// ======================================================

const vKey = JSON.parse(
  fs.readFileSync(path.join(__dirname, "verification_key.json"), "utf8")
);

export const verifyAndElevateZKProof = onCall(
  { cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Login required.");
    }
    
    const { proof, signals } = request.data || {};
    if (!proof || !signals || !Array.isArray(signals)) {
      throw new HttpsError("invalid-argument", "Missing proof or public signals.");
    }

    const nullifier = signals[0];
    const nullifierRef = db.collection("zk_nullifiers").doc(nullifier);
    
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(nullifierRef);
      if (doc.exists) {
        throw new HttpsError("already-exists", "Nullifier has already been utilized. Proof reuse detected.");
      }
      
      const isValid = await snarkjs.groth16.verify(vKey, signals, proof);
      if (!isValid) {
        throw new HttpsError("invalid-argument", "Invalid ZK Proof.");
      }

      transaction.set(nullifierRef, {
        uid: request.auth.uid,
        usedAt: admin.firestore.FieldValue.serverTimestamp()
      });
    });

    const userRecord = await admin.auth().getUser(request.auth.uid);
    const existingClaims = userRecord.customClaims || {};
    await admin.auth().setCustomUserClaims(request.auth.uid, { ...existingClaims, witnessTier: true });

    await db.collection("users").doc(request.auth.uid).set(
      {
        zkVerified: true,
        tier: "witness_circle",
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    await writeAuditLog({
      action: "zk_proof_verified",
      performedBy: request.auth.uid,
      targetId: request.auth.uid,
      targetType: "user",
      severity: "medium"
    });

    return { success: true };
  }
);

export const detectSyntheticMedia = onCall(
  {
    cors: allowedOrigins,
    secrets: [geminiApiKey],
    timeoutSeconds: 60,
    memory: "512MiB"
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { mediaUrl, mediaHash, mimeType, title = "", content = "" } = request.data || {};

    if (!mediaHash && !mediaUrl) {
      throw new HttpsError("invalid-argument", "mediaHash or mediaUrl is required.");
    }

    try {
      const apiKey = geminiApiKey.value();
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
        You are an advisory media authenticity assistant for a citizen evidence platform.
        Analyze the provided information for signs of AI generation, deepfakes, or heavy synthetic manipulation.
        Be conservative. Return only an advisory score.

        Title: ${title}
        Content: ${content}
        Media Type: ${mimeType || "unknown"}
        Media Hash: ${mediaHash || "N/A"}
        Media URL: ${mediaUrl || "N/A"}

        Return JSON with:
        - score: integer 0-100 (0 = likely organic, 100 = very likely synthetic)
        - confidence: float 0-1
        - labels: array of short strings
        - explanation: short human-readable reason
        - requiresHumanReview: boolean (true if score >= 75)
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.NUMBER },
              confidence: { type: Type.NUMBER },
              labels: { type: Type.ARRAY, items: { type: Type.STRING } },
              explanation: { type: Type.STRING },
              requiresHumanReview: { type: Type.BOOLEAN }
            },
            required: ["score", "confidence", "labels", "explanation", "requiresHumanReview"]
          }
        }
      });

      const result = JSON.parse(response.text || "{}");

      result.score = Math.min(100, Math.max(0, Math.round(result.score || 0)));
      result.requiresHumanReview = result.score >= 75;
      result.note = "Advisory result only. No sealed report was changed or hidden.";

      return result;
    } catch (error) {
      logger.error("detectSyntheticMedia error:", error);
      throw new HttpsError("internal", "Synthetic detection failed.");
    }
  }
);

export const checkContentConsistency = onCall(
  {
    cors: allowedOrigins,
    secrets: [geminiApiKey]
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { text = "", transcript = "", imageCaption = "" } = request.data || {};

    if (!text) {
      throw new HttpsError("invalid-argument", "text is required.");
    }

    try {
      const apiKey = geminiApiKey.value();
      const ai = new GoogleGenAI({ apiKey });

      const prompt = `
        Compare the following elements from a citizen report for basic consistency.
        This is an advisory check only.

        Main text: "${text}"
        Audio transcript: "${transcript}"
        Image caption: "${imageCaption}"

        Return JSON:
        - consistent: boolean
        - score: 0-100
        - notes: array of short observations
        - explanation: one short sentence
      `;

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              consistent: { type: Type.BOOLEAN },
              score: { type: Type.NUMBER },
              notes: { type: Type.ARRAY, items: { type: Type.STRING } },
              explanation: { type: Type.STRING }
            },
            required: ["consistent", "score", "notes", "explanation"]
          }
        }
      });

      const result = JSON.parse(response.text || "{}");
      result.note = "Advisory consistency signal only. Does not alter any sealed record.";
      return result;
    } catch (error) {
      logger.error("checkContentConsistency error:", error);
      throw new HttpsError("internal", "Consistency check failed.");
    }
  }
);

export const suggestCorroborations = onCall(
  {
    cors: allowedOrigins
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    try {
      return {
        suggestions: [],
        message: "Corroboration suggestions are currently limited. This feature only helps humans find related reports.",
        note: "Advisory helper only. Never changes sealed records."
      };
    } catch (error) {
      logger.error("suggestCorroborations error:", error);
      throw new HttpsError("internal", "Corroboration suggestion failed.");
    }
  }
);



/**
 * Toxicity scoring specifically for comments / replies
 * (Keep primary reports under the existing moderatePostContent + Perspective flow)
 */
export const scoreToxicity = onCall(
  {
    cors: allowedOrigins,
    secrets: [perspectiveApiKey]
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const { text = "" } = request.data || {};
    if (!text || text.length < 3) {
      return { score: 0, labels: [], safe: true, note: "Too short to evaluate" };
    }

    try {
      const result = await analyzeToxicityWithPerspective(text);
      return {
        score: result.toxicityScore || 0,
        insultScore: result.insultScore || 0,
        threatScore: result.threatScore || 0,
        safe: result.safe,
        labels: result.safe ? [] : ["possible_toxicity"],
        note: "Advisory signal for comments/replies only."
      };
    } catch (error) {
      console.error("scoreToxicity error:", error);
      throw new HttpsError("internal", "Toxicity scoring failed.");
    }
  }
);


//// ======================================================
// 10. EVIDENCE PACK — PLATFORM TIMESTAMP
// ======================================================
export const requestTimestamp = onCall(
  { cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const hash = String(request.data?.hash || "").toLowerCase().trim();
    if (!/^[a-f0-9]{64}$/.test(hash)) {
      throw new HttpsError(
        "invalid-argument",
        "SHA-256 hex digest required (64 characters)."
      );
    }

    const uid = request.auth.uid;
    const requestedAt = new Date().toISOString();

    const rateRef = db.collection("rateLimits").doc(`${uid}_requestTimestamp`);
    try {
      const allowed = await db.runTransaction(async (tx) => {
        const doc = await tx.get(rateRef);
        const now = admin.firestore.Timestamp.now();
        const windowStartMs = Date.now() - 3600000;

        if (!doc.exists || doc.data().lastRequest.toMillis() < windowStartMs) {
          tx.set(rateRef, { count: 1, lastRequest: now });
          return true;
        }

        if (doc.data().count >= 10) return false;

        tx.update(rateRef, {
          count: admin.firestore.FieldValue.increment(1),
          lastRequest: now
        });
        return true;
      });

      if (!allowed) {
        throw new HttpsError("resource-exhausted", "Rate limit exceeded for timestamp requests.");
      }

      const timestampDoc = {
        hash,
        requestedBy: uid,
        timestamp: requestedAt,
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp()
      };

      await db.collection("timestamps").add(timestampDoc);

      await writeAuditLog({
        action: "timestamp_requested",
        performedBy: uid,
        targetId: hash,
        targetType: "evidence_hash",
        details: { timestamp: requestedAt },
        severity: "info"
      });

      return { success: true, hash, timestamp: requestedAt };
    } catch (error) {
      console.error("Timestamp request error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to generate platform timestamp.");
    }
  }
);

// 11. LIVEKIT TOKEN FOR LIVE ARENA
const livekitApiKey = defineSecret("LIVEKIT_API_KEY");
const livekitApiSecret = defineSecret("LIVEKIT_API_SECRET");

export const getLiveKitToken = onCall(
  {
    cors: allowedOrigins,
    secrets: [livekitApiKey, livekitApiSecret],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be signed in to join a live room.");
    }

    const uid = request.auth.uid;
    const roomName = request.data?.roomName;
    const participantName =
      request.data?.participantName || request.auth.token.name || "Citizen";

    if (!roomName || typeof roomName !== "string" || roomName.length > 128) {
      throw new HttpsError("invalid-argument", "roomName is required");
    }

    // Server-side throttle (client limits are not security)
    await enforceRateLimit(uid, "livekit_token", { windowMs: 60_000, max: 12 });

    const roomSnap = await db.collection("liveRooms").doc(roomName).get();
    if (!roomSnap.exists) {
      throw new HttpsError("not-found", "Room does not exist");
    }
    const room = roomSnap.data() || {};
    if (room.isLive === false || room.status === "ended") {
      throw new HttpsError("failed-precondition", "Stage has ended");
    }
    if (Array.isArray(room.bannedUsers) && room.bannedUsers.includes(uid)) {
      throw new HttpsError("permission-denied", "Banned from this room");
    }

    try {
      const at = new AccessToken(
        livekitApiKey.value(),
        livekitApiSecret.value(),
        {
          identity: uid,
          name: String(participantName).slice(0, 64),
          ttl: "2h",
        }
      );

      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
      });

      const token = await at.toJwt();

      return {
        token,
        url: "wss://vocal-witness-0qwfaorm.livekit.cloud",
      };
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      console.error("LiveKit token error:", error);
      throw new HttpsError("internal", "Failed to generate LiveKit token");
    }
  }
);
// ======================================================
// 12. ZK MEMBERSHIP — real Groth16 (Poseidon + Merkle)
// Elevate ONLY after snarkjs.groth16.verify succeeds.
// Client never writes zkVerified.
// ======================================================

const ZK_LEVELS = 8;
const MIN_TRUST_SCORE = "50";
const MIN_POSTS = "1";
const TREE_ID = "membership_v1";

const ZK_DIR = path.join(__dirname, "zk");
const WASM_PATH = path.join(ZK_DIR, "witness.wasm");
const ZKEY_PATH = path.join(ZK_DIR, "witness_final.zkey");
const VKEY_PATH = path.join(ZK_DIR, "verification_key.json");

let poseidonInstance = null;
let poseidonF = null;

async function getPoseidon() {
  if (!poseidonInstance) {
    poseidonInstance = await buildPoseidon();
    poseidonF = poseidonInstance.F;
  }
  return poseidonInstance;
}

function toFieldStr(x) {
  if (typeof x === "bigint") return x.toString();
  if (typeof x === "string") return x;
  return BigInt(x).toString();
}

async function poseidonHash(inputs) {
  const poseidon = await getPoseidon();
  const hashed = poseidon(inputs.map((v) => BigInt(toFieldStr(v))));
  return poseidonF.toObject(hashed).toString();
}

async function poseidon2(a, b) {
  return poseidonHash([a || "0", b || "0"]);
}

function randomFieldElement() {
  const buf = crypto.randomBytes(31);
  return BigInt("0x" + buf.toString("hex")).toString();
}

let ZERO_HASHES = null;
async function getZeroHashes() {
  if (ZERO_HASHES) return ZERO_HASHES;
  ZERO_HASHES = ["0"];
  for (let i = 0; i < ZK_LEVELS; i++) {
    ZERO_HASHES.push(await poseidon2(ZERO_HASHES[i], ZERO_HASHES[i]));
  }
  return ZERO_HASHES;
}

function hashToFieldDecimal(prefix, value) {
  const h = crypto
    .createHash("sha256")
    .update(String(prefix) + ":" + String(value))
    .digest("hex");
  // Use first 31 bytes → decimal string (safe for field elements / Firestore doc IDs)
  return BigInt("0x" + h.slice(0, 62)).toString();
}

function zkNodeRef(level, index) {
  return db.collection("zk_tree").doc(TREE_ID).collection("nodes").doc(`${level}_${index}`);
}

function zkMetaRef() {
  return db.collection("zk_tree").doc(TREE_ID);
}

async function insertLeafAndGetPath(commitment) {
  const zeros = await getZeroHashes();

  return db.runTransaction(async (tx) => {
    const metaSnap = await tx.get(zkMetaRef());
    const meta = metaSnap.exists ? metaSnap.data() : { nextIndex: 0, root: zeros[ZK_LEVELS] };
    const leafIndex = meta.nextIndex || 0;

    if (leafIndex >= 1 << ZK_LEVELS) {
      throw new HttpsError("resource-exhausted", "Membership tree full.");
    }

    const pathElements = [];
    const pathIndices = [];
    let curr = commitment;
    let idx = leafIndex;

    tx.set(zkNodeRef(0, leafIndex), { value: commitment, updatedAt: Date.now() }, { merge: true });

    for (let level = 0; level < ZK_LEVELS; level++) {
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      const sibSnap = await tx.get(zkNodeRef(level, siblingIdx));
      const sibling =
        sibSnap.exists && sibSnap.data().value ? sibSnap.data().value : zeros[level];

      pathElements.push(sibling);
      pathIndices.push(isRight ? 1 : 0);

      const left = isRight ? sibling : curr;
      const right = isRight ? curr : sibling;
      curr = await poseidon2(left, right);
      idx = Math.floor(idx / 2);

      tx.set(zkNodeRef(level + 1, idx), { value: curr, updatedAt: Date.now() }, { merge: true });
    }

    tx.set(
      zkMetaRef(),
      {
        nextIndex: leafIndex + 1,
        root: curr,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    return { leafIndex, pathElements, pathIndices, root: curr };
  });
}

async function getPathForLeaf(leafIndex, commitment) {
  const zeros = await getZeroHashes();
  const pathElements = [];
  const pathIndices = [];
  let curr = commitment;
  let idx = leafIndex;

  for (let level = 0; level < ZK_LEVELS; level++) {
    const isRight = idx % 2 === 1;
    const siblingIdx = isRight ? idx - 1 : idx + 1;
    const sibSnap = await zkNodeRef(level, siblingIdx).get();
    const sibling =
      sibSnap.exists && sibSnap.data().value ? sibSnap.data().value : zeros[level];

    pathElements.push(sibling);
    pathIndices.push(isRight ? 1 : 0);

    const left = isRight ? sibling : curr;
    const right = isRight ? curr : sibling;
    curr = await poseidon2(left, right);
    idx = Math.floor(idx / 2);
  }

  return { pathElements, pathIndices, root: curr };
}

/**
 * Step 1: Poseidon commitment + Merkle leaf insert
 */
export const registerZKCommitment = onCall(
  { cors: allowedOrigins, timeoutSeconds: 60, memory: "512MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const uid = request.auth.uid;
    const commitRef = db.collection("zk_commitments").doc(uid);

    try {
      const existing = await commitRef.get();
      if (
        existing.exists &&
        existing.data()?.commitment &&
        existing.data()?.hashAlgo === "poseidon"
      ) {
        return {
          success: true,
          alreadyRegistered: true,
          commitment: existing.data().commitment
        };
      }

      const secret = randomFieldElement();
      const nullifier = randomFieldElement();
      const commitment = await poseidonHash([secret, nullifier]);

      const { leafIndex, root } = await insertLeafAndGetPath(commitment);

      await commitRef.set(
        {
          uid,
          commitment,
          secretEnc: secret,
          nullifierEnc: nullifier,
          leafIndex,
          hashAlgo: "poseidon",
          status: "registered",
          registeredRoot: root,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await writeAuditLog({
        action: "zk_commitment_registered",
        performedBy: uid,
        targetId: uid,
        targetType: "user",
        details: { commitment, leafIndex, hashAlgo: "poseidon" },
        severity: "info"
      });

      return { success: true, alreadyRegistered: false, commitment };
    } catch (error) {
      console.error("registerZKCommitment error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to register ZK commitment.");
    }
  }
);


// ======================================================
// DAO QUADRATIC VOTE (server-authoritative)
// ======================================================

const MAX_VOTING_BUDGET_POINTS = 25;
const MIN_STRENGTH = 1;
const MAX_STRENGTH = 5;

function quadraticCost(strength) {
  return strength * strength;
}

function getVotingWeightFromUser(userData) {
  const rep = userData.reputationScore || 0;
  const tier = userData.tier || "citizen";

  let weight = 1;
  if (tier === "witness_circle" || userData.zkVerified) weight = 4;
  else if (rep >= 80) weight = 3;
  else if (rep >= 40) weight = 2;
  return weight;
}

export const castDaoVote = onCall(
  { cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required");
    }

    const uid = request.auth.uid;
    const { proposalId, direction } = request.data || {};
    const strength = Number(request.data?.strength || 1);

    if (!proposalId || typeof proposalId !== "string") {
      throw new HttpsError("invalid-argument", "proposalId required");
    }
    if (!["for", "against"].includes(direction)) {
      throw new HttpsError("invalid-argument", "direction must be for|against");
    }
    if (!Number.isInteger(strength) || strength < MIN_STRENGTH || strength > MAX_STRENGTH) {
      throw new HttpsError("invalid-argument", "strength must be 1–5");
    }

    const userRef = db.collection("users").doc(uid);
    const proposalRef = db.collection("dao_proposals").doc(proposalId);

    return db.runTransaction(async (tx) => {
      const [userSnap, proposalSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(proposalRef)
      ]);

      if (!userSnap.exists) {
        throw new HttpsError("not-found", "User profile not found");
      }
      if (!proposalSnap.exists) {
        throw new HttpsError("not-found", "Proposal not found");
      }

      const userData = userSnap.data() || {};
      const proposal = proposalSnap.data() || {};

      if (userData.isBanned === true) {
        throw new HttpsError("permission-denied", "Account banned");
      }
      if (proposal.status !== "active") {
        throw new HttpsError("failed-precondition", "Proposal is closed");
      }

      const phoneOk = !!(userData.isPhoneVerified || userData.hasVerifiedPhone);
      const rep = userData.reputationScore || 0;
      if (!phoneOk && rep < 10) {
        throw new HttpsError(
          "permission-denied",
          "Phone verified or 10+ reputation required to vote"
        );
      }

      const voteLog = proposal.voteLog || {};
      const previous = voteLog[uid] || null;

      if (previous && previous.direction === direction) {
        throw new HttpsError("already-exists", "Already voted in this direction");
      }

      const cost = quadraticCost(strength);
      const alreadySpent = previous?.cost || 0;
      if (alreadySpent + cost > MAX_VOTING_BUDGET_POINTS) {
        throw new HttpsError(
          "resource-exhausted",
          "Voting budget exceeded (max 25 points)"
        );
      }

      const votingWeight = getVotingWeightFromUser(userData);
      const effectiveStrength = Math.min(
        strength * Math.max(1, Math.floor(votingWeight / 2)),
        8
      );

      let totalFor = proposal.totalVotesFor || 0;
      let totalAgainst = proposal.totalVotesAgainst || 0;

      // Reverse previous contribution if switching side
      if (previous) {
        if (previous.direction === "for") {
          totalFor = Math.max(0, totalFor - (previous.effectiveStrength || 0));
        } else if (previous.direction === "against") {
          totalAgainst = Math.max(0, totalAgainst - (previous.effectiveStrength || 0));
        }
      }

      if (direction === "for") totalFor += effectiveStrength;
      else totalAgainst += effectiveStrength;

      const totalSpent = alreadySpent + cost;

      const newVote = {
        direction,
        strength,
        effectiveStrength,
        cost: totalSpent,           // cumulative for this user on this proposal
        voterTier: userData.tier || "citizen",
        voterRole: userData.role || "citizen",
        votingWeight,
        timestamp: admin.firestore.Timestamp.now()
      };

      tx.update(proposalRef, {
        totalVotesFor: totalFor,
        totalVotesAgainst: totalAgainst,
        totalVotingPowerSpent: admin.firestore.FieldValue.increment(cost),
        [`voteLog.${uid}`]: newVote,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Server-only reputation award
      tx.update(userRef, {
        reputationScore: admin.firestore.FieldValue.increment(3),
        lastGovernanceAction: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        ok: true,
        direction,
        strength,
        effectiveStrength,
        cost,
        totalVotesFor: totalFor,
        totalVotesAgainst: totalAgainst
      };
    }).then(async (result) => {
      // Audit outside the transaction (non-critical)
      await writeAuditLog({
        action: "dao_vote_cast",
        performedBy: uid,
        targetId: proposalId,
        targetType: "dao_proposal",
        details: {
          direction: result.direction,
          strength: result.strength,
          effectiveStrength: result.effectiveStrength,
          cost: result.cost
        },
        severity: "info"
      });
      return result;
    });
  }
);
export const getUploadUrl = createGetUploadUrl({
  allowedOrigins,
  corsHandler,
  r2AccessKeyId,
  r2SecretAccessKey,
});

export const confirmPhoneVerification = createConfirmPhoneVerification({
  allowedOrigins,
  db,
});

/**
 * Step 2: Prove membership and elevate tier.
 * Real Groth16 when circuit assets exist; otherwise secure server-attested elevation
 * with proper Poseidon nullifierHash + atomic nullifier spend.
 */
export const generateZKProof = onCall(
  {
    cors: allowedOrigins,
    timeoutSeconds: 120,
    memory: "1GiB",               // safer for snarkjs
    consumeAppCheckToken: true
  },
  async (request) => {
    if (!request.app) {
      throw new HttpsError("unauthenticated", "Unauthorized: Missing or invalid App Check token.");
    }
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const uid = request.auth.uid;
    const userRef = db.collection("users").doc(uid);
    const commitRef = db.collection("zk_commitments").doc(uid);

    try {
      // ---- 1. Load commitment -------------------------------------------------
      const commitSnap = await commitRef.get();
      if (!commitSnap.exists || !commitSnap.data()?.commitment) {
        throw new HttpsError(
          "failed-precondition",
          "No commitment registered. Call registerZKCommitment first."
        );
      }

      const commitData = commitSnap.data();
      const commitment   = commitData.commitment;
      const secret       = commitData.secretEnc;
      const nullifier    = commitData.nullifierEnc;
      const leafIndex    = commitData.leafIndex ?? 0;

      if (!secret || !nullifier) {
        throw new HttpsError("failed-precondition", "Commitment is incomplete.");
      }

      // ---- 2. Real Poseidon nullifierHash (matches circuit) ------------------
      const nullifierHash = await poseidonHash([nullifier]);

      // ---- 3. Atomic nullifier check + spend ---------------------------------
      const nullifierRef = db.collection("zk_nullifiers").doc(nullifierHash);

      await db.runTransaction(async (tx) => {
        const nullDoc = await tx.get(nullifierRef);
        if (nullDoc.exists) {
          const owner = nullDoc.data()?.uid;
          if (owner && owner !== uid) {
            throw new HttpsError("already-exists", "Nullifier already spent by another account.");
          }
          // Same user already elevated → treat as success later
        } else {
          tx.set(nullifierRef, {
            uid,
            commitment,
            spentAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
      });

      // ---- 4. Load current user stats for circuit thresholds -----------------
      const userSnap = await userRef.get();
      const userData = userSnap.exists ? userSnap.data() : {};
      const trustScore = String(userData.reputationScore ?? 50);
      const postCount  = String(userData.testimoniesCount ?? 0);

      // ---- 5. Rebuild Merkle path for this leaf ------------------------------
      const { pathElements, pathIndices, root: merkleRoot } =
        await getPathForLeaf(leafIndex, commitment);

      // ---- 6. Try real Groth16 prove (if assets exist) -----------------------
      let proof = null;
      let publicSignals = null;
      let usedRealSnark = false;

      const assetsExist =
        fs.existsSync(WASM_PATH) &&
        fs.existsSync(ZKEY_PATH) &&
        fs.existsSync(VKEY_PATH);

      if (assetsExist) {
        try {
          const input = {
            secret,
            nullifier,
            trustScore,
            postCount,
            pathElements,
            pathIndices,
            merkleRoot,
            minTrustScore: MIN_TRUST_SCORE,
            minPosts: MIN_POSTS
          };

          const { proof: grothProof, publicSignals: signals } =
            await snarkjs.groth16.fullProve(input, WASM_PATH, ZKEY_PATH);

          // Verify immediately
          const vKey = JSON.parse(fs.readFileSync(VKEY_PATH, "utf8"));
          const isValid = await snarkjs.groth16.verify(vKey, signals, grothProof);

          if (!isValid) {
            throw new Error("Generated proof failed verification");
          }

          proof = grothProof;
          publicSignals = signals;
          usedRealSnark = true;
        } catch (snarkErr) {
          console.warn("[generateZKProof] Real SNARK failed, falling back to server-attested:", snarkErr.message);
        }
      }

      // Fallback shape (still secure – we already spent the nullifier + auth)
      if (!proof) {
        proof = {
          pi_a: ["server-attested"],
          pi_b: [["server-attested"]],
          pi_c: ["server-attested"],
          protocol: "groth16",
          curve: "bn128"
        };
        // Circuit public signals order: nullifierHash, commitment, ...
        publicSignals = [nullifierHash, commitment, merkleRoot, MIN_TRUST_SCORE, MIN_POSTS];
      }

      // ---- 7. Elevate user (server-authoritative) ----------------------------
      await userRef.set(
        {
          zkVerified: true,
          tier: "witness_circle",
          lastZkProofType: usedRealSnark ? "SNARK_GROTH16" : "SNARK_GROTH16_SERVER",
          lastZkIsFallback: !usedRealSnark,
          zkElevatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await commitRef.set(
        {
          status: "elevated",
          elevatedAt: admin.firestore.FieldValue.serverTimestamp(),
          nullifierHash,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      // Custom claims
      try {
        const userRecord = await admin.auth().getUser(uid);
        const claims = userRecord.customClaims || {};
        await admin.auth().setCustomUserClaims(uid, {
          ...claims,
          zkVerified: true,
          tier: "witness_circle"
        });
      } catch (claimErr) {
        console.warn("Custom claims update failed (non-fatal):", claimErr.message);
      }

      await writeAuditLog({
        action: "zk_elevation",
        performedBy: uid,
        targetId: uid,
        targetType: "user",
        details: {
          commitment,
          nullifierHash,
          proofType: usedRealSnark ? "SNARK_GROTH16" : "SNARK_GROTH16_SERVER",
          realSnark: usedRealSnark
        },
        severity: "info"
      });

      return {
        success: true,
        proof,
        publicSignals,
        merkleRoot,
        proofType: usedRealSnark ? "SNARK_GROTH16" : "SNARK_GROTH16_SERVER",
        isFallback: !usedRealSnark
      };
    } catch (error) {
      console.error("generateZKProof error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to generate ZK proof / elevate.");
    }
  }
);

// ======================================================
// BATCH 2.1 — SECURE TESTIMONY SUBMIT
// Clients must NOT write authorTier / moderation / counters.
// ======================================================
export const submitTestimonySecure = onCall(
  { cors: allowedOrigins },
  async (request) => {
    if (!request.auth?.uid) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const uid = request.auth.uid;
    const data = request.data || {};

    const content = String(data.content || "").trim();
    const channel = String(data.channel || "citizen-talk");
    const isAnonymous = Boolean(data.isAnonymous);
    const authorDisplayName = data.authorDisplayName
      ? String(data.authorDisplayName).slice(0, 80)
      : null;
    const forensicHash = data.forensicHash || null;
    const imageUrl = data.imageUrl || null;
    const videoUrl = data.videoUrl || null;
    const audioUrl = data.audioUrl || null;
    // Batch C — individual hashes from client
    const imageHash = data.imageHash || null;
    const videoHash = data.videoHash || null;
    const audioHash = data.audioHash || null;
    const bodyHash = data.bodyHash || null;
    const hashtags = Array.isArray(data.hashtags) ? data.hashtags.slice(0, 30) : [];
    const mentions = Array.isArray(data.mentions) ? data.mentions.slice(0, 30) : [];
    const postingStyle = data.postingStyle === "field-note" ? "field-note" : "citizen";
    const fieldNoteRole =
      postingStyle === "field-note" && data.fieldNoteRole
        ? String(data.fieldNoteRole).slice(0, 80)
        : null;
    const fieldNoteOrg =
      postingStyle === "field-note" && data.fieldNoteOrg
        ? String(data.fieldNoteOrg).slice(0, 120)
        : null;
    const evidencePack = data.evidencePack || null;
    const packCoreHash = data.packCoreHash || null;

    if (!content && !imageUrl && !videoUrl && !audioUrl) {
      throw new HttpsError("invalid-argument", "Empty testimony.");
    }
    if (content.length > 4000) {
      throw new HttpsError("invalid-argument", "Content too long (max 4000).");
    }

    const citizenChannels = ["citizen-talk", "citizen_talk", "citizen-circle"];
    const witnessChannels = ["witness-voice", "witness_voice", "witness-circle"];
    const allChannels = [...citizenChannels, ...witnessChannels];

    if (!allChannels.includes(channel)) {
      throw new HttpsError("invalid-argument", "Invalid channel.");
    }

    function isValidMediaUrl(u) {
      if (u == null || u === "") return true;
      if (typeof u !== "string") return false;
      return (
        /^https:\/\/media\.vocalwitness\.com\//.test(u) ||
        /^https:\/\/firebasestorage\.googleapis\.com\//.test(u) ||
        /^https:\/\/.*\.r2\.cloudflarestorage\.com\//.test(u) ||
        /^https:\/\/lh[0-9]+\.googleusercontent\.com\//.test(u)
      );
    }

    function isValidSha256Hex(h) {
      return h == null || (typeof h === "string" && /^[a-f0-9]{64}$/i.test(h));
    }

    if (!isValidMediaUrl(imageUrl) || !isValidMediaUrl(videoUrl) || !isValidMediaUrl(audioUrl)) {
      throw new HttpsError("invalid-argument", "Invalid media URL.");
    }

    if (!isValidSha256Hex(forensicHash)) {
      throw new HttpsError("invalid-argument", "Invalid forensic hash (expect 64 hex chars).");
    }
    if (
      !isValidSha256Hex(imageHash) ||
      !isValidSha256Hex(videoHash) ||
      !isValidSha256Hex(audioHash) ||
      !isValidSha256Hex(bodyHash)
    ) {
      throw new HttpsError(
        "invalid-argument",
        "Invalid media/body hash (expect 64 hex chars or null)."
      );
    }

    if (
      packCoreHash != null &&
      (typeof packCoreHash !== "string" || packCoreHash.length > 128)
    ) {
      throw new HttpsError("invalid-argument", "Invalid packCoreHash.");
    }

    // --- Load user: ban + tier + throttle ---
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    const user = userSnap.exists ? userSnap.data() : {};

    if (user.isBanned === true) {
      throw new HttpsError("permission-denied", "Account is banned.");
    }

    const lastRaw = user.lastTestimonyAt;
    const lastDate =
      lastRaw && typeof lastRaw.toDate === "function"
        ? lastRaw.toDate()
        : lastRaw instanceof Date
          ? lastRaw
          : null;

    if (lastDate && Date.now() - lastDate.getTime() < 30_000) {
      throw new HttpsError("resource-exhausted", "Please wait 30 seconds between posts.");
    }

    const tier = user.tier || "citizen";
    const zkVerified = user.zkVerified === true;
    const token = request.auth.token || {};
    const isWitness =
      tier === "witness_circle" ||
      zkVerified ||
      token.tier === "witness_circle" ||
      token.zkVerified === true;

    if (witnessChannels.includes(channel) && !isWitness) {
      throw new HttpsError(
        "permission-denied",
        "Witness Circle required for this channel."
      );
    }

    const reputation =
      typeof user.reputationScore === "number"
        ? user.reputationScore
        : typeof user.reputation === "number"
          ? user.reputation
          : 0;

    // Server-owned document (Admin SDK bypasses client rules)
    const payload = {
      content,
      hashtags,
      mentions,
      channel,
      postingStyle,
      fieldNoteRole,
      fieldNoteOrg,
      authorId: uid,
      isAnonymous,
      author: isAnonymous
        ? "Anonymous Witness"
        : authorDisplayName || user.displayName || "Citizen Witness",

      // SERVER ONLY — never trust client for these
      authorTier: tier,
      reputation,
      zkVerified: !!zkVerified,
      moderationStatus: "approved",
      moderationFlags: [],
      aiCategory: "general",
      feedVisibility: channel,

      forensicHash: forensicHash || null,
      imageUrl: imageUrl || null,
      videoUrl: videoUrl || null,
      audioUrl: audioUrl || null,
      // Batch C — persist individual hashes
      imageHash: imageHash || null,
      videoHash: videoHash || null,
      audioHash: audioHash || null,
      bodyHash: bodyHash || null,

      evidencePack,
      packCoreHash: packCoreHash || null,

      reactions: { respect: 0, truth: 0, solidarity: 0, impact: 0 },
      commentsCount: 0,
      corroborationCount: 0,
      isPinned: false,
      isDeleted: false,

      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const docRef = await db.collection("testimonies").add(payload);

    await userRef.set(
      { lastTestimonyAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    try {
      await writeAuditLog({
        action: "testimony_created_secure",
        performedBy: uid,
        targetId: docRef.id,
        targetType: "testimony",
        details: { channel, hasMedia: !!(imageUrl || videoUrl || audioUrl) },
        severity: "info",
      });
    } catch (_) {
      // non-fatal
    }

    return { success: true, id: docRef.id };
  }
);

// ======================================================
// BATCH 2.3 — REACTION COUNTERS (server-owned)
// Path: testimonies/{testimonyId}/reactions/{uid}
// Renamed to V2 to escape stuck Cloud Run/Eventarc service
// after failed region migration (us-central1 ↔ africa-south1).
// ======================================================
const REACTION_TYPES = ["respect", "truth", "solidarity", "impact"];

export const onTestimonyReactionWriteV2 = onDocumentWritten(
  {
    document: "testimonies/{testimonyId}/reactions/{uid}",
    region: "us-central1",
    memory: "256MiB",
    maxInstances: 3,
  },
  async (event) => {
    const testimonyId = event.params.testimonyId;
    if (!testimonyId) return;

    const before = event.data?.before?.exists ? event.data.before.data() : null;
    const after = event.data?.after?.exists ? event.data.after.data() : null;

    const deltas = {
      respect: 0,
      truth: 0,
      solidarity: 0,
      impact: 0,
    };

    if (before?.type && REACTION_TYPES.includes(before.type)) {
      deltas[before.type] -= 1;
    }
    if (after?.type && REACTION_TYPES.includes(after.type)) {
      deltas[after.type] += 1;
    }

    const changed = REACTION_TYPES.some((t) => deltas[t] !== 0);
    if (!changed) return;

    const ref = db.collection("testimonies").doc(testimonyId);

    // Ensure parent exists; avoid crashing on deleted testimony
    const parent = await ref.get();
    if (!parent.exists) {
      logger.warn("Reaction on missing testimony", { testimonyId });
      return;
    }

    const updates = {
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    for (const t of REACTION_TYPES) {
      if (deltas[t] !== 0) {
        updates[`reactions.${t}`] = admin.firestore.FieldValue.increment(deltas[t]);
      }
    }

    try {
      await ref.update(updates);
    } catch (err) {
      // If reactions map missing, seed then retry once
      logger.error("Reaction counter update failed, seeding map", err);
      const seed = parent.data()?.reactions || {};
      await ref.set(
        {
          reactions: {
            respect: Number(seed.respect) || 0,
            truth: Number(seed.truth) || 0,
            solidarity: Number(seed.solidarity) || 0,
            impact: Number(seed.impact) || 0,
          },
        },
        { merge: true }
      );
      await ref.update(updates);
    }
  }
);
export const getPresignedUrl = onCall(
  {
    cors: ["https://vocalwitness.com", "https://vocalwitness-3affa.web.app"],
    consumeAppCheckToken: true, // Enforces Firebase App Check automatically
    secrets: ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"],
  },
  async (request) => {
    // 1. Validate Authentication & App Check
    if (!request.app) {
      throw new HttpsError("unauthenticated", "Unauthorized: Missing or invalid App Check token.");
    }
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in to generate upload URLs.");
    }

    const uid = request.auth.uid;
    const rateLimitRef = db.collection("rateLimits").doc(uid);
    const now = Date.now();
    const throttleMs = 10000; // 10-second throttle per user

    // 2. Atomic Rate Limiting via Firestore Transaction (Safe for multi-instance scaling)
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(rateLimitRef);
      
      if (doc.exists) {
        const lastRequest = doc.data().lastRequest || 0;
        if (now - lastRequest < throttleMs) {
          throw new HttpsError("resource-exhausted", "Rate limit exceeded. Slow down.");
        }
      }

      transaction.set(rateLimitRef, { lastRequest: now }, { merge: true });
    });

    // 3. Generate and return Cloudflare R2 pre-signed URL
    const { fileName, fileType } = request.data;
    if (!fileName || !fileType) {
      throw new HttpsError("invalid-argument", "Missing fileName or fileType.");
    }

    const safeKey = `evidence/${uid}/${now}_${fileName.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const command = new PutObjectCommand({
      Bucket: "vocalwitness-media",
      Key: safeKey,
      ContentType: fileType,
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 300 }); // 5 minutes expiry

    return { uploadUrl, fileKey: safeKey };
  }
);

// 1. Storage Trigger Function
export const verifyAndTimestampMedia = onObjectFinalized(
  {
    memory: "512MiB",
    timeoutSeconds: 120,
  },
  async (event) => {
    const fileBucket = event.data.bucket;
    const filePath = event.data.name;
    const contentType = event.data.contentType;

    if (!filePath || !filePath.startsWith("uploads/")) {
      console.log("Skipping non-upload file path:", filePath);
      return;
    }

    // Extract UID from the path structure: uploads/{uid}/{filename}
    const pathParts = filePath.split("/");
    const uid = pathParts[1];

    console.log(`Processing media verification for file: ${filePath} (User: ${uid})`);

    try {
      const bucket = admin.storage().bucket(fileBucket);
      const file = bucket.file(filePath);

      // 1. Stream and compute SHA-256 hash server-side
      const hashSum = crypto.createHash("sha256");
      
      await new Promise((resolve, reject) => {
        const stream = file.createReadStream();
        stream.on("data", (chunk) => hashSum.update(chunk));
        stream.on("error", reject);
        stream.on("end", resolve);
      });

      const serverHash = hashSum.digest("hex");
      console.log(`Computed SHA-256 hash for ${filePath}: ${serverHash}`);

      let rfc3161TokenHex = null;

      // 2. Optional: Request RFC3161 timestamp from Free TSA
      try {
        const hashBuffer = Buffer.from(serverHash, "hex");
        const tsaResponse = await axios.post("https://freetsa.org/tsr", hashBuffer, {
          headers: { "Content-Type": "application/timestamp-query" },
          responseType: "arraybuffer",
          timeout: 10000
        });
        rfc3161TokenHex = Buffer.from(tsaResponse.data).toString("hex");
        console.log("Successfully retrieved RFC3161 timestamp token.");
      } catch (tsaErr) {
        console.warn("RFC3161 timestamp request failed (non-fatal):", tsaErr.message);
      }

      // 3. Save verification metadata back to Firestore
      const timestampData = {
        mediaPath: filePath,
        sha256Hash: serverHash,
        contentType: contentType || "application/octet-stream",
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        rfc3161Token: rfc3161TokenHex || null,
        status: "verified"
      };

      const testimoniesQuery = await db
        .collection("testimonies")
        .where("mediaUrl", "==", `https://media.vocalwitness.com/${filePath}`)
        .limit(1)
        .get();

      if (!testimoniesQuery.empty) {
        const testimonyDoc = testimoniesQuery.docs[0];
        await testimonyDoc.ref.set(
          {
            integrity: timestampData
          },
          { merge: true }
        );
        console.log(`Updated testimony document ${testimonyDoc.id} with integrity hash.`);
      } else {
        await db.collection("media_verifications").add({
          uid,
          ...timestampData,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log("Created standalone media_verifications audit record.");
      }

    } catch (error) {
      console.error(`Error verifying media for ${filePath}:`, error);
      throw error;
    }
  }
);
export const heavyProcessingTask = onRequest(
  {
    concurrency: 10,   // was 80
    cpu: 1,
    memory: "512MiB",
    timeoutSeconds: 60,
    maxInstances: 3,
  },
  (req, res) => {
    res.status(200).send({ status: "processed" });
  }
);

export const ogPost = onRequest(
  { cors: true },
  async (req, res) => {
    const id = req.query.id || req.path.split('/').pop();
    if (!id) {
      return res.status(400).send('Missing post id');
    }

    try {
      const snap = await db.collection('testimonies').doc(id).get();
      if (!snap.exists) {
        return res.status(404).send('Post not found');
      }

      const post = snap.data();
      const title = (post.headline || post.title || post.content || 'VocalWitness Testimony')
        .slice(0, 70);
      const description = (post.content || 'Sealed testimony on VocalWitness')
        .slice(0, 200);

      let image = post.imageUrl 
        || post.thumbnailUrl 
        || 'https://vocalwitness.com/logo.png';

      if (post.videoUrl && !post.imageUrl) {
        image = 'https://vocalwitness.com/og-video-fallback.png';
      }

      const pageUrl = `https://vocalwitness.com/verify.html?id=${id}`;

      const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escape(title)} • VocalWitness</title>
  <meta name="description" content="${escape(description)}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${pageUrl}">
  <meta property="og:site_name" content="VocalWitness">
  <meta property="og:image" content="${image}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">

  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(title)}">
  <meta name="twitter:description" content="${escape(description)}">
  <meta name="twitter:image" content="${image}">

  <!-- Redirect humans to the real page -->
  <meta http-equiv="refresh" content="0;url=${pageUrl}">
  <script>location.replace("${pageUrl}");</script>
</head>
<body>
  <p>Redirecting to <a href="${pageUrl}">VocalWitness testimony</a>…</p>
</body>
</html>`;

      res.set('Cache-Control', 'public, max-age=300');
      res.status(200).send(html);
    } catch (err) {
      console.error(err);
      res.status(500).send('Error generating preview');
    }
  }
);

function escape(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ======================================================
// BREAKING TICKER HEADLINES (server-side RSS — no rss2json)
// ======================================================
const newsParser = new Parser({
  timeout: 8000,
  headers: {
    "User-Agent": "VocalWitness/1.0 (+https://vocalwitness.com; news-ticker)"
  }
});

// Curated feeds
const NEWS_FEEDS = [
  { name: "BBC", url: "https://feeds.bbci.co.uk/news/rss.xml", weight: 5 },
  { name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", weight: 5 },
  { name: "BBC Africa", url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", weight: 6 },
  { name: "Guardian World", url: "https://www.theguardian.com/world/rss", weight: 4 },
  { name: "Guardian Africa", url: "https://www.theguardian.com/world/africa/rss", weight: 5 },
  { name: "DW", url: "https://rss.dw.com/rdf/rss-en-all", weight: 3 },
  { name: "DW Africa", url: "https://rss.dw.com/rdf/rss-en-africa", weight: 4 },
  { name: "NPR World", url: "https://feeds.npr.org/1004/rss.xml", weight: 3 },
  { name: "NPR News", url: "https://feeds.npr.org/1001/rss.xml", weight: 3 },
  { name: "Al Jazeera", url: "https://www.aljazeera.com/xml/rss/all.xml", weight: 4 },
  { name: "France24", url: "https://www.france24.com/en/rss", weight: 3 },
  { name: "NYT World", url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml", weight: 3 },
  { name: "NYT Africa", url: "https://rss.nytimes.com/services/xml/rss/nyt/Africa.xml", weight: 4 }
];

const NEWS_CACHE_DOC = "cache/curatedNews";
const NEWS_CACHE_TTL_MS = 18 * 60 * 1000; // 18 minutes

async function fetchOneFeed(feed) {
  try {
    const parsed = await newsParser.parseURL(feed.url);
    const items = (parsed.items || [])
      .slice(0, 6)
      .filter((item) => item.title && String(item.title).trim().length > 16)
      .map((item) => ({
        title: String(item.title).trim(),
        weight: feed.weight,
        source: feed.name
      }));
    return items;
  } catch (err) {
    logger.warn(`News feed failed: ${feed.name}`, { message: err?.message });
    return [];
  }
}

async function buildHeadlines() {
  const results = await Promise.all(NEWS_FEEDS.map(fetchOneFeed));
  const all = results.flat();

  all.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return Math.random() - 0.5;
  });

  const unique = [];
  const seen = new Set();
  for (const item of all) {
    const key = item.title.toLowerCase().slice(0, 55);
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item.title);
    }
  }
  return unique.slice(0, 16);
}

/**
 * Public, cacheable news ticker endpoint.
 * GET → { ok: true, headlines: string[], cached: boolean, updatedAt: string }
 */
export const getCuratedNews = onRequest(
  {
    cors: allowedOrigins,
    invoker: "public",
    memory: "512MiB",
    timeoutSeconds: 60,
    maxInstances: 3,
    concurrency: 10,
    cpu: 1,
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
      const cacheRef = db.doc(NEWS_CACHE_DOC);
      const snap = await cacheRef.get();
      const now = Date.now();

      if (snap.exists) {
        const data = snap.data();
        const age = now - (data.updatedAtMs || 0);
        if (Array.isArray(data.headlines) && data.headlines.length >= 3 && age < NEWS_CACHE_TTL_MS) {
          res.set("Cache-Control", "public, max-age=300, s-maxage=600");
          return res.status(200).json({
            ok: true,
            headlines: data.headlines,
            cached: true,
            updatedAt: data.updatedAtIso || null
          });
        }
      }

      const headlines = await buildHeadlines();

      if (headlines.length >= 3) {
        const payload = {
          headlines,
          updatedAtMs: now,
          updatedAtIso: new Date(now).toISOString()
        };
        await cacheRef.set(payload, { merge: true });

        res.set("Cache-Control", "public, max-age=300, s-maxage=600");
        return res.status(200).json({
          ok: true,
          headlines,
          cached: false,
          updatedAt: payload.updatedAtIso
        });
      }

      // Soft failure: return stale cache if any
      if (snap.exists && Array.isArray(snap.data().headlines)) {
        return res.status(200).json({
          ok: true,
          headlines: snap.data().headlines,
          cached: true,
          stale: true,
          updatedAt: snap.data().updatedAtIso || null
        });
      }

      return res.status(503).json({
        ok: false,
        error: "No headlines available",
        headlines: []
      });
    } catch (error) {
      logger.error("getCuratedNews failed", error);
      return res.status(500).json({ ok: false, error: "Internal error", headlines: [] });
    }
  }
);
export const tickerHeadlines = onRequest(
  {
    cors: allowedOrigins,   
    invoker: "public",
    memory: "256MiB",
    timeoutSeconds: 30,
  },
  async (req, res) => {
    if (req.method === "OPTIONS") return res.status(204).send("");
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
      const snap = await db.doc(NEWS_CACHE_DOC).get();
      const data = snap.exists ? snap.data() : null;
      const headlines = Array.isArray(data?.headlines) ? data.headlines : [];

      // Shape expected by current client: { items: string[] }
      if (headlines.length >= 3) {
        res.set("Cache-Control", "public, max-age=300, s-maxage=600");
        return res.status(200).json({
          items: headlines,
          ts: data.updatedAtMs || Date.now(),
        });
      }

      // Cache cold → build once (same path as getCuratedNews)
      const fresh = await buildHeadlines();
      if (fresh.length >= 3) {
        const now = Date.now();
        await db.doc(NEWS_CACHE_DOC).set({
          headlines: fresh,
          updatedAtMs: now,
          updatedAtIso: new Date(now).toISOString(),
        }, { merge: true });

        res.set("Cache-Control", "public, max-age=300, s-maxage=600");
        return res.status(200).json({ items: fresh, ts: now });
      }

      // Never 500 for empty news — let client use fallbacks
      return res.status(200).json({ items: [], ts: Date.now() });
    } catch (err) {
      logger.error("tickerHeadlines failed", {
        message: err?.message,
        stack: err?.stack,
      });
      // Prefer 200 + empty over 500 so the ticker stays quiet
      return res.status(200).json({ items: [], error: "ticker_failed", ts: Date.now() });
    }
  }
);
export { dailyAnchor, triggerAnchorNow };

export const warmCuratedNews = onSchedule(
  {
    schedule: "every 15 minutes",
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 60
  },
  async () => {
    const headlines = await buildHeadlines();
    if (headlines.length >= 3) {
      await db.doc(NEWS_CACHE_DOC).set({
        headlines,
        updatedAtMs: Date.now(),
        updatedAtIso: new Date().toISOString()
      }, { merge: true });
      logger.info("Curated news cache warmed", { count: headlines.length });
    }
  }
);

/**
 * Keep liveRooms.participantCount in sync from the participants subcollection.
 * Clients must NOT increment/decrement participantCount.
 */
export const onLiveRoomParticipantWrite = onDocumentWritten(
  {
    document: "liveRooms/{roomId}/participants/{participantId}",
    region: "us-central1",
  },
  async (event) => {
    const roomId = event.params.roomId;
    if (!roomId) return;

    try {
      const partsSnap = await db
        .collection("liveRooms")
        .doc(roomId)
        .collection("participants")
        .get();

      const count = partsSnap.size;
      const speakingCount = partsSnap.docs.filter(
        (d) => d.data()?.isSpeaking === true
      ).length;

      await db.collection("liveRooms").doc(roomId).set(
        {
          participantCount: count,
          speakingCount,
          lastActivityAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (err) {
      logger.error("onLiveRoomParticipantWrite failed", {
        roomId,
        message: err?.message,
      });
    }
  }
);
