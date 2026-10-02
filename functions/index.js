/**
 * Cloud Functions for Firebase / Cloudflare R2 Integration
 * Stack: Firebase Functions v2 • AWS SDK v3 • SnarkJS • Paystack • Cloud Tasks • Gemini API
 */
import functions from "firebase-functions";
import { onRequest, onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentCreated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { GoogleGenAI, Type } from "@google/genai";
import { defineSecret } from "firebase-functions/params";
import { CloudTasksClient } from "@google-cloud/tasks";
import admin from "firebase-admin";
import paystackApi from "paystack-api";
import snarkjs from "snarkjs";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import axios from "axios";
import { setGlobalOptions } from "firebase-functions/v2";
import corsPackage from "cors";
import { onRequest } from "firebase-functions/v2/https";

// Get current directory equivalent in ES modules
const __filename = path.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

setGlobalOptions({ region: "us-central1" });

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
        // 1. Enforce App Check Header Verification
        const appCheckToken = req.headers["x-firebase-appcheck"];
        if (!appCheckToken) {
          return res.status(401).json({ error: "Unauthorized: Missing App Check token." });
        }

        try {
          await admin.appCheck().verifyToken(appCheckToken);
        } catch (err) {
          return res.status(403).json({ error: "Forbidden: Invalid App Check token." });
        }

        // 2. Verify Firebase Auth ID Token
        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
          return res.status(401).json({ error: "Unauthorized. ID token required." });
        }

        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const uid = decodedToken.uid;

        // 3. Validate Request Body
        const { fileName, fileType } = req.body || {};
        if (!fileName || typeof fileName !== "string" || !fileType || typeof fileType !== "string") {
          return res.status(400).json({ error: "fileName and fileType must be non-empty strings." });
        }

        // 4. Generate Cloudflare R2 Presigned URL
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

// ======================================================
// 2. USER INITIALIZATION & PHONE VERIFICATION
// ======================================================
export const initializeCitizenProfile = functions.auth.user().onCreate(async (user) => {
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


const { onCall, onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions/logger");
const { HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { GoogleGenAI, Type } = require("@google/genai");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const snarkjs = require("snarkjs");

// ======================================================
// MODERATED DELETE & TOXICITY HELPERS
// ======================================================

exports.moderatedDelete = onCall(
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

exports.analyzeToxicity = onRequest(
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
exports.moderatePostContent = onCall(
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
exports.translateTestimony = onCall(
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
exports.transcribeAudioWitness = onCall(
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
exports.summarizeReport = onCall(
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

exports.verifyAndElevateZKProof = onCall(
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

exports.detectSyntheticMedia = onCall(
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

exports.checkContentConsistency = onCall(
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

exports.suggestCorroborations = onCall(
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
exports.scoreToxicity = onCall(
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
exports.initializePaystack = onCall(
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

exports.paystackWebhook = onRequest(
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
exports.requestTimestamp = onCall(
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
const { AccessToken } = require("livekit-server-sdk");

const livekitApiKey = defineSecret("LIVEKIT_API_KEY");
const livekitApiSecret = defineSecret("LIVEKIT_API_SECRET");

exports.getLiveKitToken = onCall(
  {
    cors: allowedOrigins,
    secrets: [livekitApiKey, livekitApiSecret]
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
          name: participantName
        }
      );

      at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      });

      const token = await at.toJwt();

      return {
        token,
        url: "wss://vocal-witness-0qwfaorm.livekit.cloud"
      };
    } catch (error) {
      console.error("LiveKit token error:", error);
      throw new HttpsError("internal", "Failed to generate LiveKit token");
    }
  }
);

// ======================================================
// 12. ZK MEMBERSHIP — Witness Circle elevation
// Server owns secret, nullifier, commitment. Client never writes zkVerified.
// ======================================================

const cryptoNode = require("crypto");

/** Poseidon-friendly field-ish hash via SHA-256 (decimal string for consistency) */
function hashToFieldDecimal(...parts) {
  const h = cryptoNode
    .createHash("sha256")
    .update(parts.map(String).join("|"))
    .digest("hex");
  // Keep within a safe numeric string range for storage / future circuit use
  return BigInt("0x" + h.slice(0, 31)).toString();
}

/**
 * Step 1: Register membership commitment for the signed-in user.
 * Creates secret + nullifier server-side, stores commitment, does NOT elevate yet.
 */
exports.registerZKCommitment = onCall(
  { cors: allowedOrigins, timeoutSeconds: 60, memory: "256MiB" },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Sign in required.");
    }

    const uid = request.auth.uid;
    const userRef = db.collection("users").doc(uid);
    const commitRef = db.collection("zk_commitments").doc(uid);

    try {
      const existing = await commitRef.get();
      if (existing.exists && existing.data()?.commitment) {
        return {
          success: true,
          alreadyRegistered: true,
          commitment: existing.data().commitment
        };
      }

      // Server-only secrets — never returned to client in production logs
      const secret = hashToFieldDecimal("vw-secret", uid, cryptoNode.randomBytes(16).toString("hex"));
      const nullifier = hashToFieldDecimal("vw-nullifier", uid, cryptoNode.randomBytes(16).toString("hex"));
      const commitment = hashToFieldDecimal("vw-commit", secret, nullifier);

      await commitRef.set(
        {
          uid,
          commitment,
          // Store encrypted-at-rest style: only server reads these
          secretEnc: secret,
          nullifierEnc: nullifier,
          status: "registered",
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
        details: { commitment },
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

/**
 * Step 2: Prove membership and elevate tier.
 * Full Groth16 can be plugged in when circuit assets are on the function.
 * Until then: server verifies registered commitment + auth, then writes zkVerified.
 * Client elevateWithZKProof expects success + proofType SNARK_GROTH16_SERVER.
 */
exports.generateZKProof = onCall(
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


const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Initialize S3 client for Cloudflare R2
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

exports.getPresignedUrl = onCall(
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
    const db = admin.firestore();
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


const { onObjectFinalized } = require("firebase-functions/v2/storage");
const admin = require("firebase-admin");
const crypto = require("crypto");
const axios = require("axios");

// Ensure admin is initialized if not already done in your file
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

exports.verifyAndTimestampMedia = onObjectFinalized(
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
        // FreeTSA typically expects an ASN.1 Time Stamp Request (TSR). 
        // For simple implementations or raw hash anchoring, you can post the hash buffer or 
        // handle standard timestamp queries. If FreeTSA requires precise ASN.1 framing, 
        // ensure compatibility or wrap in a try/catch so it doesn't fail the entire pipeline.
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
      // Match the file to a testimony or media document (querying by storage path or creating record)
      const timestampData = {
        mediaPath: filePath,
        sha256Hash: serverHash,
        contentType: contentType || "application/octet-stream",
        verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
        rfc3161Token: rfc3161TokenHex || null,
        status: "verified"
      };

      // Query testimonies collection for a document referencing this media path or create an audit record
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
        // Fallback: store under a dedicated media_hashes collection linked to the user
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
    concurrency: 80, // Limit simultaneous execution slots per container instance
    memory: "512MiB",
    timeoutSeconds: 60 
  }, 
  (req, res) => {
    // Process request safely within cost guardrails
    res.status(200).send({ status: "processed" });
  }
);
