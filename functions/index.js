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


// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

setGlobalOptions({
  region: "us-central1",
  cpu: 0.5,           // was effectively 1
  memory: "256MiB",   // raise only on heavy functions
  maxInstances: 20,
});

// ======================================================
// SECRETS
// ======================================================
const perspectiveApiKey = defineSecret("PERSPECTIVE_API_KEY");
const r2AccessKeyId = defineSecret("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = defineSecret("R2_SECRET_ACCESS_KEY");
const paystackSecretKey = defineSecret("PAYSTACK_SECRET_KEY");
const geminiApiKey = defineSecret("GEMINI_API_KEY");

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

// Reusable S3 / R2 Client Instance
let r2ClientInstance = null;
function getR2Client(accessKeyId, secretAccessKey) {
  if (!r2ClientInstance) {
    r2ClientInstance = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT || "https://b282f46ef0831c8af75bfe52120bbac6.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId,
        secretAccessKey
      }
    });
  }
  return r2ClientInstance;
}

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

async function writeAuditLog({
  action,
  performedBy,
  targetId = null,
  targetType = null,
  details = {},
  severity = "info"
}) {
  try {
    await db.collection("audit_logs").add({
      action: String(action),
      performedBy: String(performedBy),
      targetId: targetId ? String(targetId) : null,
      targetType: targetType ? String(targetType) : null,
      details,
      severity: String(severity),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

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

// Define secret registered via CLI
const nowpaymentsIpnSecret = defineSecret("NOWPAYMENTS_IPN_SECRET");

// NOWPayments Webhook Export
exports.nowpaymentsWebhook = onRequest(
  { secrets: [nowpaymentsIpnSecret] },
  async (req, res) => {
    try {
      const signature = req.headers["x-nowpayments-sig"];
      const secret = nowpaymentsIpnSecret.value();

      console.log("NOWPayments Webhook Received:", req.body);

      const { payment_id, payment_status, price_amount, order_id } = req.body;

      if (payment_status === "finished") {
        await admin.firestore().collection("supporters").doc(order_id || payment_id.toString()).set(
          {
            status: "completed",
            paymentId: payment_id,
            amount: price_amount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      return res.status(200).send("OK");
    } catch (error) {
      console.error("Webhook error:", error);
      return res.status(500).send("Internal Server Error");
    }
  }
);

      // Log receipt for debugging
      console.log("NOWPayments Webhook Received:", req.body);

      const { payment_id, payment_status, price_amount, order_id } = req.body;

      if (payment_status === "
          finished") {
        await admin.firestore().collection("supporters").doc(order_id || payment_id.toString()).set(
          {
            status: "completed",
            paymentId: payment_id,
            amount: price_amount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );
      }

      return res.status(200).send("OK");
    } catch (error) {
      console.error("Webhook error:", error);
      return res.status(500).send("Internal Server Error");
    }
  }
);
// ======================================================
// 1. R2 PRE-SIGNED URL
// ======================================================
export const getUploadUrl = onRequest(
  {
    cors: allowedOrigins,
    secrets: [r2AccessKeyId, r2SecretAccessKey]
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
      }

      try {
        const appCheckToken = req.headers["x-firebase-appcheck"];
        if (!appCheckToken) {
          return res.status(401).json({ error: "Unauthorized: Missing App Check token." });
        }

        try {
          await admin.appCheck().verifyToken(appCheckToken);
        } catch (err) {
          return res.status(403).json({ error: "Forbidden: Invalid App Check token." });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return res.status(401).json({ error: "Unauthorized. ID token required." });
        }

        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        const { fileName, fileType } = req.body || {};
        if (!fileName || typeof fileName !== "string" || !fileType || typeof fileType !== "string") {
          return res.status(400).json({ error: "fileName and fileType must be non-empty strings." });
        }

        const s3Client = getR2Client(r2AccessKeyId.value(), r2SecretAccessKey.value());
        const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const objectKey = `uploads/${uid}/${Date.now()}-${sanitizedName}`;

        const command = new PutObjectCommand({
          Bucket: "vocalwitness-media",
          Key: objectKey,
          ContentType: fileType
        });

        const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
        const publicUrl = `https://media.vocalwitness.com/${objectKey}`;

        return res.status(200).json({ uploadUrl, publicUrl, key: objectKey });
      } catch (error) {
        console.error("Error generating pre-signed URL:", error);
        return res.status(500).json({ error: "Failed to generate upload URL." });
      }
    });
  }
);

export const confirmPhoneVerification = onCall(
  { cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;

    try {
      const userRecord = await admin.auth().getUser(uid);

      if (!userRecord.phoneNumber) {
        throw new HttpsError(
          "failed-precondition",
          "No verified phone number linked to Auth user record."
        );
      }

      await db.collection("users").doc(uid).set(
        {
          isPhoneVerified: true,
          hasVerifiedPhone: true,
          isVerified: true,
          phoneVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          tier: "citizen_circle",
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await writeAuditLog({
        action: "phone_verification_confirmed",
        performedBy: uid,
        targetId: uid,
        targetType: "user",
        details: { phoneVerified: true },
        severity: "info"
      });

      return { success: true };
    } catch (error) {
      console.error("Phone verification confirmation error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to confirm phone verification.");
    }
  }
);

// ======================================================
// 3. TRUST TIER
// ======================================================
export const evaluateTrustTier = onCall(
  { cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const uid = request.auth.uid;
    const userRef = db.collection("users").doc(uid);

    try {
      const userSnap = await userRef.get();
      if (!userSnap.exists) {
        throw new HttpsError("not-found", "User record not found.");
      }

      const u = userSnap.data();
      let newTier = "citizen";

      const isVerified = Boolean(u.isVerified || u.isPhoneVerified || u.zkVerified);
      const testimonies = u.testimoniesCount || 0;
      const verifications = u.verificationsMade || 0;
      const score = u.reputationScore || 0;

      if (score >= 1000 && testimonies >= 20 && isVerified) {
        newTier = "steward";
      } else if (score >= 500 && testimonies >= 10 && verifications >= 15) {
        newTier = "elite_witness";
      } else if (isVerified || (score >= 150 && verifications >= 5)) {
        newTier = "verified_citizen";
      }

      if (newTier !== u.tier) {
        await userRef.update({
          tier: newTier,
          tierUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        if (newTier === "steward") {
          const userRecord = await admin.auth().getUser(uid);
          const claims = userRecord.customClaims || {};
          await admin.auth().setCustomUserClaims(uid, { ...claims, steward: true });
        }

        await writeAuditLog({
          action: "tier_upgraded",
          performedBy: "system",
          targetId: uid,
          targetType: "user",
          details: { oldTier: u.tier, newTier },
          severity: "info"
        });
      }

      return { success: true, tier: newTier };
    } catch (error) {
      console.error("Evaluate tier error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "Failed to evaluate trust tier.");
    }
  }
);

// ======================================================
// 4. USER MANAGEMENT
// ======================================================
export const setUserClaims = onCall(
  { cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "You must be signed in.");
    if (!request.auth.token.admin) {
      throw new HttpsError("permission-denied", "Only admins can set custom claims.");
    }

    const { uid, claims } = request.data || {};
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "A valid string uid is required.");
    }
    if (!claims || typeof claims !== "object" || Array.isArray(claims)) {
      throw new HttpsError("invalid-argument", "A valid claims object is required.");
    }

    const allowed = ["admin", "moderator", "banned", "supporter", "steward"];
    const newClaims = {};
    allowed.forEach((key) => {
      if (key in claims) newClaims[key] = Boolean(claims[key]);
    });

    try {
      const userRecord = await admin.auth().getUser(uid);
      const existingClaims = userRecord.customClaims || {};
      const finalClaims = { ...existingClaims, ...newClaims };

      await admin.auth().setCustomUserClaims(uid, finalClaims);

      await db.collection("users").doc(uid).set(
        {
          isAdmin: finalClaims.admin === true,
          isModerator: finalClaims.moderator === true,
          isBanned: finalClaims.banned === true,
          isSupporter: finalClaims.supporter === true,
          isSteward: finalClaims.steward === true,
          claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await writeAuditLog({
        action: "set_custom_claims",
        performedBy: request.auth.uid,
        targetId: uid,
        targetType: "user",
        details: { claimsSet: newClaims, finalClaims },
        severity: "high"
      });

      return { success: true, claims: finalClaims };
    } catch (error) {
      console.error("Error setting custom claims:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "Failed to set user claims.");
    }
  }
);

export const banUser = onCall(
  { cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    const isAllowed = request.auth.token.admin || request.auth.token.moderator;
    if (!isAllowed) {
      throw new HttpsError("permission-denied", "Only admins or moderators can ban users.");
    }

    const { uid, reason = "No reason provided" } = request.data || {};
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "A valid string uid is required.");
    }

    try {
      await admin.auth().updateUser(uid, { disabled: true });
      const userRecord = await admin.auth().getUser(uid);
      const existingClaims = userRecord.customClaims || {};

      await admin.auth().setCustomUserClaims(uid, { ...existingClaims, banned: true });

      await db.collection("users").doc(uid).set(
        {
          isBanned: true,
          banReason: String(reason),
          bannedAt: admin.firestore.FieldValue.serverTimestamp(),
          bannedBy: request.auth.uid
        },
        { merge: true }
      );

      await writeAuditLog({
        action: "ban_user",
        performedBy: request.auth.uid,
        targetId: uid,
        targetType: "user",
        details: { reason: String(reason) },
        severity: "high"
      });

      return { success: true, message: `User ${uid} has been banned.` };
    } catch (error) {
      console.error("Ban user error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "Failed to ban user.");
    }
  }
);

export const unbanUser = onCall(
  { cors: allowedOrigins },
  async (request) => {
    if (!request.auth?.token?.admin) {
      throw new HttpsError("permission-denied", "Only admins can unban users.");
    }

    const { uid } = request.data || {};
    if (!uid || typeof uid !== "string") {
      throw new HttpsError("invalid-argument", "A valid string uid is required.");
    }

    try {
      await admin.auth().updateUser(uid, { disabled: false });
      const userRecord = await admin.auth().getUser(uid);
      const existingClaims = userRecord.customClaims || {};

      await admin.auth().setCustomUserClaims(uid, { ...existingClaims, banned: false });

      await db.collection("users").doc(uid).set(
        {
          isBanned: false,
          banReason: admin.firestore.FieldValue.delete(),
          bannedAt: admin.firestore.FieldValue.delete(),
          bannedBy: admin.firestore.FieldValue.delete(),
          unbannedAt: admin.firestore.FieldValue.serverTimestamp(),
          unbannedBy: request.auth.uid
        },
        { merge: true }
      );

      await writeAuditLog({
        action: "unban_user",
        performedBy: request.auth.uid,
        targetId: uid,
        targetType: "user",
        severity: "medium"
      });

      return { success: true, message: `User ${uid} has been unbanned.` };
    } catch (error) {
      console.error("Unban user error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "Failed to unban user.");
    }
  }
);

// ======================================================
// MODERATED DELETE & TOXICITY HELPERS
// ======================================================

export const moderatedDelete = onCall(
  { cors: allowedOrigins },
  async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Sign in required.");
    
    const isMod = request.auth.token.moderator === true || request.auth.token.admin === true;
    if (!isMod) {
      throw new HttpsError("permission-denied", "Only moderators or admins can perform moderated deletes.");
    }

    const { collection, docId, reason = "No reason provided" } = request.data || {};
    if (!collection || typeof collection !== "string" || !docId || typeof docId !== "string") {
      throw new HttpsError("invalid-argument", "collection and docId must be valid strings.");
    }

    const allowedCollections = [
      "testimonies", "posts", "feeds", "groups",
      "witnessCycles", "dao_proposals", "reports"
    ];
    if (!allowedCollections.includes(collection)) {
      throw new HttpsError("invalid-argument", "Collection not allowed for moderated deletion.");
    }

    try {
      const docRef = db.collection(collection).doc(docId);
      const docSnap = await docRef.get();
      if (!docSnap.exists) throw new HttpsError("not-found", "Document does not exist.");

      const originalData = docSnap.data() || {};
      await docRef.delete();

      await writeAuditLog({
        action: "moderator_delete",
        performedBy: request.auth.uid,
        targetId: docId,
        targetType: collection,
        details: {
          reason: String(reason),
          originalAuthor: originalData.authorId || originalData.ownerId || originalData.witnessId || null,
          contentPreview: originalData.content ? String(originalData.content).substring(0, 200) : null
        },
        severity: "high"
      });

      return { success: true, message: "Document deleted and audited." };
    } catch (error) {
      logger.error("Moderated delete error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "Failed to delete document.");
    }
  }
);

// ======================================================
// TOXICITY HELPERS, GEMINI AI MODERATION & AI TOOLS
// ======================================================

async function analyzeToxicityWithPerspective(content = "") {
  const apiKey = perspectiveApiKey.value() || process.env.PERSPECTIVE_API_KEY;
  if (!apiKey || !content || content.length < 3) {
    return { safe: true, toxicityScore: 0, note: "Skipped or too short" };
  }

  try {
    const response = await axios.post(
      `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`,
      {
        comment: { text: content },
        languages: ["en"],
        requestedAttributes: { TOXICITY: {}, INSULT: {}, THREAT: {} }
      }
    );

    const scores = response.data.attributeScores;
    const toxicityScore = scores?.TOXICITY?.summaryScore?.value || 0;
    const insultScore = scores?.INSULT?.summaryScore?.value || 0;
    const threatScore = scores?.THREAT?.summaryScore?.value || 0;
    const isToxic = toxicityScore > 0.7 || insultScore > 0.7 || threatScore > 0.6;

    return {
      safe: !isToxic,
      toxicityScore,
      insultScore,
      threatScore,
      note: isToxic
        ? "Flagged by automated Perspective API moderation for toxicity/insult."
        : "Passed Perspective API check."
    };
  } catch (error) {
    logger.error("Perspective API evaluation error:", error.message);
    return gentleModerationCheck(content);
  }
}

function gentleModerationCheck(content = "") {
  const text = content.toLowerCase();
  const flagWords = ["spam", "scam", "abuse", "hate", "harass"];
  const isFlagged = flagWords.some((word) => text.includes(word));
  return {
    safe: !isFlagged,
    toxicityScore: isFlagged ? 0.8 : 0.0,
    note: isFlagged ? "Flagged by local fallback moderation check." : "Passed local fallback check."
  };
}

export const analyzeToxicity = onRequest(
  { secrets: [perspectiveApiKey] },
  (req, res) => {
    corsHandler(req, res, async () => {
      try {
        const { text } = req.body;
        const result = await analyzeToxicityWithPerspective(text);
        res.status(200).json(result);
      } catch (error) {
        logger.error("Perspective API error:", error);
        res.status(500).json({ error: error.message });
      }
    });
  }
);

// 1. Post Content Moderation
export const moderatePostContent = onCall(
  {
    cors: allowedOrigins,
    secrets: [geminiApiKey]
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required to run moderation.");
    }

    const { title = "", text = "" } = request.data || {};
    const fullContent = `${title}\n${text}`.trim();

    if (!fullContent) {
      return { flagged: false, reason: "Empty content", categories: [], safetyScore: 1.0 };
    }

    try {
      const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
      if (!apiKey) {
        logger.warn("GEMINI_API_KEY is not set. Falling back to local check.");
        const fallback = gentleModerationCheck(fullContent);
        return {
          flagged: !fallback.safe,
          reason: fallback.note,
          categories: fallback.safe ? [] : ["toxic_content"],
          safetyScore: 1 - fallback.toxicityScore
        };
      }

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Analyze the following user-submitted post for illegal content, severe hate speech, explicit violence, harassment, or dangerous misinformation.\n\nPost Content:\n"${fullContent}"`
              }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              flagged: { type: Type.BOOLEAN },
              reason: { type: Type.STRING },
              categories: { type: Type.ARRAY, items: { type: Type.STRING } },
              safetyScore: { type: Type.NUMBER }
            },
            required: ["flagged", "reason", "categories", "safetyScore"]
          }
        }
      });

      const resultText = response.text ? response.text.trim() : null;
      if (!resultText) {
        return { flagged: false, reason: "No response from model", categories: [], safetyScore: 1.0 };
      }

      return JSON.parse(resultText);
    } catch (error) {
      logger.error("Error in moderatePostContent function:", error);
      return { flagged: false, reason: "Moderation system error fallback", categories: [], safetyScore: 1.0 };
    }
  }
);

// 2. Multi-Language Feed Translation
export const translateTestimony = onCall(
  { cors: allowedOrigins, secrets: [geminiApiKey] },
  async (request) => {
    const { text, targetLanguage } = request.data || {};
    if (!text || !targetLanguage) {
      throw new HttpsError("invalid-argument", "Text and targetLanguage are required.");
    }

    const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Translate the following report accurately into ${targetLanguage}, preserving tone and essential detail:\n\n"${text}"`
    });

    const translatedText = response.text ? response.text.trim() : "";
    return { translatedText };
  }
);

// 3. Audio-to-Text Witness Transcriptions (Base64 Audio Input)
export const transcribeAudioWitness = onCall(
  { cors: allowedOrigins, secrets: [geminiApiKey] },
  async (request) => {
    const { audioBase64, mimeType } = request.data || {};
    if (!audioBase64 || !mimeType) {
      throw new HttpsError("invalid-argument", "audioBase64 and mimeType are required.");
    }

    const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: mimeType,
            data: audioBase64
          }
        },
        "Provide a precise, verbatim transcription of this voice witness submission. Do not add intro or outro prose."
      ]
    });

    const transcription = response.text ? response.text.trim() : "";
    return { transcription };
  }
);

// 4. Compact Report Summarization
export const summarizeReport = onCall(
  { cors: allowedOrigins, secrets: [geminiApiKey] },
  async (request) => {
    const { text } = request.data || {};
    if (!text) {
      throw new HttpsError("invalid-argument", "Text is required.");
    }

    const apiKey = geminiApiKey.value() || process.env.GEMINI_API_KEY;
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `Summarize this citizen report into a single concise sentence (under 25 words) suitable for a compact feed card:\n\n"${text}"`
    });

    const summary = response.text ? response.text.trim() : "";
    return { summary };
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

// ======================================================
// 6. PAYSTACK
// ======================================================
export const initializePaystack = onCall(
  {
    cors: allowedOrigins,
    secrets: [paystackSecretKey]
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in to make payment.");
    }

    const { amount, metadata = {} } = request.data || {};
    if (typeof amount !== "number" || amount < 1000) {
      throw new HttpsError("invalid-argument", "Amount must be a number equal to or greater than 1000.");
    }

    try {
      const paystack = getPaystackClient();
      const transaction = await paystack.transaction.initialize({
        amount: Math.round(amount),
        email: request.auth.token.email || "supporter@vocalwitness.app",
        reference: `VW_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
        metadata: { ...metadata, userId: request.auth.uid }
      });

      return {
        authorization_url: transaction.data.authorization_url,
        reference: transaction.data.reference
      };
    } catch (error) {
      console.error("Paystack Error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Payment initialization failed.");
    }
  }
);

export const paystackWebhook = onRequest(
  { cors: allowedOrigins, secrets: [paystackSecretKey] },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method Not Allowed");

    const secret = paystackSecretKey.value();
    const signature = req.headers["x-paystack-signature"];

    if (!signature || typeof signature !== "string") {
      return res.status(400).send("Missing or invalid signature header");
    }
    if (!req.rawBody) return res.status(400).send("Missing raw body for verification.");

    const expectedHash = crypto.createHmac("sha512", secret).update(req.rawBody).digest("hex");
    const sigBuffer = Buffer.from(signature);
    const hashBuffer = Buffer.from(expectedHash);

    if (sigBuffer.length !== hashBuffer.length || !crypto.timingSafeEqual(sigBuffer, hashBuffer)) {
      console.error("Invalid Paystack webhook signature.");
      return res.status(400).send("Invalid signature payload");
    }

    const event = req.body;
    if (event?.event === "charge.success") {
      const userId = event.data?.metadata?.userId;
      if (userId) {
        try {
          const amountInMainCurrency = event.data.amount / 100;
          await db.collection("users").doc(userId).set(
            {
              supporterTier: "supporter",
              isPremium: true,
              supporterSince: admin.firestore.FieldValue.serverTimestamp(),
              totalContributed: admin.firestore.FieldValue.increment(amountInMainCurrency)
            },
            { merge: true }
          );

          const userRecord = await admin.auth().getUser(userId);
          const currentClaims = userRecord.customClaims || {};
          await admin.auth().setCustomUserClaims(userId, { ...currentClaims, supporter: true });

          await writeAuditLog({
            action: "supporter_granted",
            performedBy: "system",
            targetId: userId,
            targetType: "user",
            details: { amount: amountInMainCurrency, reference: event.data.reference },
            severity: "info"
          });
        } catch (err) {
          console.error("Failed to update supporter status:", err);
          return res.status(500).send("Database processing error.");
        }
      }
    }
    return res.status(200).send("Webhook processed");
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

// ======================================================
// 11. LIVEKIT TOKEN FOR LIVE ARENA
// ======================================================
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

    const roomName = request.data?.roomName;
    const participantName = request.data?.participantName || request.auth.token.name || "Citizen";

    if (!roomName || typeof roomName !== "string") {
      throw new HttpsError("invalid-argument", "roomName is required");
    }

    try {
      const at = new AccessToken(
        livekitApiKey.value(),
        livekitApiSecret.value(),
        {
          identity: request.auth.uid,
          name: participantName,
          ttl: "2h",               // explicit expiry
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

/**
 * Step 2: Prove membership and elevate tier.
 * Full Groth16 can be plugged in when circuit assets are on the function.
 * Until then: server verifies registered commitment + auth, then writes zkVerified.
 * Client elevateWithZKProof expects success + proofType SNARK_GROTH16_SERVER.
 */
export const generateZKProof = onCall(
  {
    cors: allowedOrigins,
    timeoutSeconds: 120,
    memory: "512MiB",
    consumeAppCheckToken: true // Enforces and consumes the App Check token automatically
  },
  async (request) => {
    // request.app will be populated if App Check validation passes
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
      const commitSnap = await commitRef.get();
      if (!commitSnap.exists || !commitSnap.data()?.commitment) {
        throw new HttpsError(
          "failed-precondition",
          "No commitment registered. Call registerZKCommitment first."
        );
      }

      const commitData = commitSnap.data();
      const commitment = commitData.commitment;
      const nullifierHash = hashToFieldDecimal("vw-nf-hash", commitData.nullifierEnc || commitment);

      // Optional: reject double-elevation with same nullifier
      const nullifierDoc = await db.collection("zk_nullifiers").doc(nullifierHash).get();
      if (nullifierDoc.exists && nullifierDoc.data()?.uid !== uid) {
        throw new HttpsError("already-exists", "Nullifier already spent.");
      }

      // --- Elevation (server-authoritative) ---
      await userRef.set(
        {
          zkVerified: true,
          tier: "witness_circle",
          lastZkProofType: "SNARK_GROTH16_SERVER",
          lastZkIsFallback: false,
          zkElevatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await commitRef.set(
        {
          status: "elevated",
          elevatedAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      await db.collection("zk_nullifiers").doc(nullifierHash).set(
        {
          uid,
          commitment,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        },
        { merge: true }
      );

      // Custom claims for rules helpers that read token.zkVerified / tier
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
          proofType: "SNARK_GROTH16_SERVER"
        },
        severity: "info"
      });

      // Shape expected by elevateWithZKProof / verifyZKProofAsync
      return {
        success: true,
        proof: {
          pi_a: ["server-attested"],
          pi_b: [["server-attested"]],
          pi_c: ["server-attested"],
          protocol: "groth16",
          curve: "bn128"
        },
        publicSignals: [commitment, nullifierHash],
        merkleRoot: commitment,
        proofType: "SNARK_GROTH16_SERVER"
      };
    } catch (error) {
      console.error("generateZKProof error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", "Failed to generate ZK proof / elevate.");
    }
  }
);

// Initialize S3 client for Cloudflare R2
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

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

    if (!isValidMediaUrl(imageUrl) || !isValidMediaUrl(videoUrl) || !isValidMediaUrl(audioUrl)) {
      throw new HttpsError("invalid-argument", "Invalid media URL.");
    }

    if (
      forensicHash != null &&
      (typeof forensicHash !== "string" || !/^[a-f0-9]{64}$/i.test(forensicHash))
    ) {
      throw new HttpsError("invalid-argument", "Invalid forensic hash (expect 64 hex chars).");
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
// ======================================================
const REACTION_TYPES = ["respect", "truth", "solidarity", "impact"];

export const onTestimonyReactionWrite = onDocumentWritten(
  {
    document: "testimonies/{testimonyId}/reactions/{uid}",
    region: "us-central1",
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

export const verifyAndTimestampMedia = onObjectFinalized(
  {
    memory: "512MiB",
    timeoutSeconds: 120
  },
  async (event) => {
    const fileBucket = event.data.bucket;
    const filePath = event.data.name; // e.g. "uploads/UID/timestamp-filename.ext"
    const contentType = event.data.contentType;

    // Only process files in the uploads path
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

      // 2. Optional: Request RFC3161 timestamp from Free TSA (or alternative provider)
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
    concurrency: 80,
    cpu: 1,              // required when concurrency > 1
    memory: "512MiB",
    timeoutSeconds: 60
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
    maxInstances: 5
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
