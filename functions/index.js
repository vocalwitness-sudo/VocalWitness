/**
 * Cloud Functions for Firebase / Cloudflare R2 Integration
 * Stack: Firebase Functions v2 • AWS SDK v3 • SnarkJS • Paystack • Cloud Tasks
 */

const functions = require("firebase-functions");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { defineSecret } = require("firebase-functions/params");
const { CloudTasksClient } = require("@google-cloud/tasks");
const admin = require("firebase-admin");
const paystackApi = require("paystack-api");
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const axios = require("axios");

// ======================================================
// SECRETS
// ======================================================
const perspectiveApiKey = defineSecret("PERSPECTIVE_API_KEY");
const r2AccessKeyId = defineSecret("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = defineSecret("R2_SECRET_ACCESS_KEY");
const paystackSecretKey = defineSecret("PAYSTACK_SECRET_KEY");

// ======================================================
// INITIALIZE
// ======================================================
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();
const tasksClient = new CloudTasksClient();

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
const LOCATION = "us-central1";
const QUEUE_NAME = "heavy-processing-queue";

// ======================================================
// RESTRICTED CORS HELPER
// ======================================================
const allowedOrigins = [
  "https://vocalwitness-3affa.web.app",
  "https://vocalwitness-3affa.firebaseapp.com",
  "https://vocalwitness.com",
  "https://www.vocalwitness.com"
];

const corsHandler = require("cors")({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Firebase-AppCheck"],
  maxAge: 3600,
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
        serviceAccountEmail: `${PROJECT_ID}@appspot.gserviceaccount.com`,
      },
    },
  };

  if (delaySeconds > 0) {
    task.scheduleTime = {
      seconds: Math.floor(Date.now() / 1000) + delaySeconds,
    };
  }

  const [response] = await tasksClient.createTask({ parent, task });
  return response.name;
}

const getPaystackClient = () => {
  const secret = paystackSecretKey.value();
  if (!secret) {
    throw new Error("Paystack secret key configuration is missing.");
  }
  return paystackApi(secret);
};

async function writeAuditLog({
  action,
  performedBy,
  targetId = null,
  targetType = null,
  details = {},
  severity = "info",
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
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

// ======================================================
// 1. R2 PRE-SIGNED URL
// ======================================================
exports.getUploadUrl = onRequest(
  {
    cors: allowedOrigins,
    secrets: [r2AccessKeyId, r2SecretAccessKey],
  },
  (req, res) => {
    corsHandler(req, res, async () => {
      if (req.method === "OPTIONS") return res.status(204).send("");
      if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
      }

      try {
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

        const s3Client = new S3Client({
          region: "auto",
          endpoint:
            process.env.R2_ENDPOINT ||
            "https://b282f46ef0831c8af75bfe52120bbac6.r2.cloudflarestorage.com",
          credentials: {
            accessKeyId: r2AccessKeyId.value(),
            secretAccessKey: r2SecretAccessKey.value(),
          },
        });

        const sanitizedName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, "_");
        const objectKey = `uploads/${uid}/${Date.now()}-${sanitizedName}`;

        const command = new PutObjectCommand({
          Bucket: "vocalwitness-media",
          Key: objectKey,
          ContentType: fileType,
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
// 2. USER INITIALIZATION (v1 Auth Trigger)
// ======================================================
exports.initializeCitizenProfile = functions.auth.user().onCreate(async (user) => {
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
    isPhoneVerified: false,
    isVerified: false,
    phoneNumber: user.phoneNumber || "",
    zkVerified: false,
    verifiedAt: null,
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
    badges: ["casual_talker"],
  };

  try {
    await db.collection("users").doc(userId).set(defaultCitizenData, { merge: true });

    await admin.auth().setCustomUserClaims(userId, {
      admin: false,
      moderator: false,
      banned: false,
      supporter: false,
      steward: false,
    });

    await writeAuditLog({
      action: "user_created",
      performedBy: "system",
      targetId: userId,
      targetType: "user",
      details: { email: user.email || null },
      severity: "info",
    });

    console.log(`✅ Created profile for user: ${userId}`);
  } catch (error) {
    console.error(`Error creating profile for ${userId}:`, error);
  }
});
// ======================================================
// 3. TRUST TIER
// ======================================================
exports.evaluateTrustTier = onCall(
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
          tierUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
          severity: "info",
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
exports.setUserClaims = onCall(
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
          claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

      await writeAuditLog({
        action: "set_custom_claims",
        performedBy: request.auth.uid,
        targetId: uid,
        targetType: "user",
        details: { claimsSet: newClaims, finalClaims },
        severity: "high",
      });

      return { success: true, claims: finalClaims };
    } catch (error) {
      console.error("Error setting custom claims:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "Failed to set user claims.");
    }
  }
);

exports.banUser = onCall(
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
          bannedBy: request.auth.uid,
        },
        { merge: true }
      );

      await writeAuditLog({
        action: "ban_user",
        performedBy: request.auth.uid,
        targetId: uid,
        targetType: "user",
        details: { reason: String(reason) },
        severity: "high",
      });

      return { success: true, message: `User ${uid} has been banned.` };
    } catch (error) {
      console.error("Ban user error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "Failed to ban user.");
    }
  }
);

exports.unbanUser = onCall(
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
          unbannedBy: request.auth.uid,
        },
        { merge: true }
      );

      await writeAuditLog({
        action: "unban_user",
        performedBy: request.auth.uid,
        targetId: uid,
        targetType: "user",
        severity: "medium",
      });

      return { success: true, message: `User ${uid} has been unbanned.` };
    } catch (error) {
      console.error("Unban user error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "Failed to unban user.");
    }
  }
);

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
      "witnessCycles", "dao_proposals", "reports",
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
          contentPreview: originalData.content ? String(originalData.content).substring(0, 200) : null,
        },
        severity: "high",
      });

      return { success: true, message: "Document deleted and audited." };
    } catch (error) {
      console.error("Moderated delete error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "Failed to delete document.");
    }
  }
);

// ======================================================
// TOXICITY HELPERS
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
        requestedAttributes: { TOXICITY: {}, INSULT: {}, THREAT: {} },
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
        : "Passed Perspective API check.",
    };
  } catch (error) {
    console.error("Perspective API evaluation error:", error.message);
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
    note: isFlagged ? "Flagged by local fallback moderation check." : "Passed local fallback check.",
  };
}

// ======================================================
// 6. PAYSTACK
// ======================================================
exports.initializePaystack = onCall(
  {
    cors: allowedOrigins,
    secrets: [paystackSecretKey],
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
        metadata: { ...metadata, userId: request.auth.uid },
      });

      return {
        authorization_url: transaction.data.authorization_url,
        reference: transaction.data.reference,
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
              totalContributed: admin.firestore.FieldValue.increment(amountInMainCurrency),
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
            severity: "info",
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

// ======================================================
// 7. RATE LIMITING
// ======================================================
exports.checkRateLimit = onCall(
  { cors: allowedOrigins },
  async (request) => {
    let userId = request.auth?.uid;
    if (!userId) {
      const ip = request.rawRequest?.ip || "unknown";
      userId = "anonymous_" + String(ip).replace(/[.:]/g, "_");
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

        if (!doc.exists || doc.data().lastRequest.toDate() < windowStart) {
          transaction.set(rateDocRef, {
            count: 1,
            firstRequest: now,
            lastRequest: now,
          });
          return true;
        }

        if (doc.data().count >= maxCalls) return false;

        transaction.update(rateDocRef, {
          count: admin.firestore.FieldValue.increment(1),
          lastRequest: now,
        });
        return true;
      });

      return { allowed: isAllowed };
    } catch (error) {
      console.error("Rate limit check failed:", error);
      return { allowed: true };
    }
  }
);

// ======================================================
// 8. ZERO-KNOWLEDGE PROOFS
// ======================================================
exports.generateZKProof = onCall(
  {
    cors: allowedOrigins,
    memory: "2GiB",
    timeoutSeconds: 60,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required to generate ZK proof.");
    }

    const { inputs } = request.data || {};
    if (!inputs || typeof inputs !== "object") {
      throw new HttpsError("invalid-argument", "Missing or invalid inputs object.");
    }

    try {
      const wasmPath = path.join(__dirname, "verification.wasm");
      const zkeyPath = path.join(__dirname, "verification_final.zkey");

      if (!fs.existsSync(wasmPath) || !fs.existsSync(zkeyPath)) {
        throw new HttpsError("failed-precondition", "Circuit artifacts missing on server.");
      }

      const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasmPath, zkeyPath);
      return { success: true, proof, publicSignals };
    } catch (error) {
      console.error("Server ZK proof generation error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "Failed to generate ZK proof.");
    }
  }
);

exports.verifyZKProof = onCall(
  { cors: allowedOrigins },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Authentication required to submit ZK proof.");
    }

    const { proof, publicSignals } = request.data || {};
    if (!proof || !publicSignals) {
      throw new HttpsError("invalid-argument", "Missing proof or public signals payload.");
    }

    try {
      const keyPath = path.join(__dirname, "verification_key.json");
      if (!fs.existsSync(keyPath)) {
        throw new HttpsError("failed-precondition", "Verification key file not found.");
      }

      const vKey = JSON.parse(fs.readFileSync(keyPath, "utf8"));
      const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

      if (isValid) {
        const uid = request.auth.uid;
        await db.collection("users").doc(uid).set(
          {
            zkVerified: true,
            zkVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true }
        );

        await writeAuditLog({
          action: "zk_proof_verified",
          performedBy: uid,
          targetId: uid,
          targetType: "user",
          severity: "info",
        });
      }

      return { isValid };
    } catch (error) {
      console.error("ZK verification error:", error);
      if (error instanceof HttpsError) throw error;
      throw new HttpsError("internal", error.message || "Failed to verify ZK proof.");
    }
  }
);

// ======================================================
// 9. MEDIA FORENSIC PIPELINE
// ======================================================
exports.verifyMediaPipeline = onDocumentCreated(
  {
    document: "testimonies/{postId}",
    secrets: [perspectiveApiKey],
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const postId = event.params.postId;

    try {
      const moderation = await analyzeToxicityWithPerspective(data.content || "");

      await snap.ref.set(
        {
          moderationStatus: moderation.safe ? "approved" : "flagged",
          toxicityScore: moderation.toxicityScore || 0,
          moderationNote: moderation.note || "",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    } catch (error) {
      console.error(`Failed to process media pipeline for ${postId}:`, error);
    }
  }
);

// ======================================================
// EXPORTED CLOUD FUNCTIONS
// ======================================================

/**
 * Example 1: Generate R2 Presigned Upload URL
 */
exports.getUploadUrl = onRequest({
  secrets: [r2AccessKeyId, r2SecretAccessKey]
}, (req, res) => {
  corsHandler(req, res, async () => {
    try {
      // Initialize AWS S3 Client with Cloudflare R2 Credentials
      const s3Client = new S3Client({
        region: "auto",
        endpoint: "https://b282f46ef0831c8af75bfe52120bbac6.r2.cloudflarestorage.com",
        credentials: {
          accessKeyId: r2AccessKeyId.value(),
          secretAccessKey: r2SecretAccessKey.value(),
        },
      });

      const { fileName, fileType } = req.body;
      const command = new PutObjectCommand({
        Bucket: "vocalwitness-media",
        Key: fileName,
        ContentType: fileType,
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
      res.status(200).json({ uploadUrl });
    } catch (error) {
      console.error("Presigned URL error:", error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Example 2: Perspective Toxicity Analysis
 */
exports.analyzeToxicity = onRequest({
  secrets: [perspectiveApiKey]
}, (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const { text } = req.body;
      const apiKey = perspectiveApiKey.value();

      const response = await axios.post(
        `https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze?key=${apiKey}`,
        {
          comment: { text },
          requestedAttributes: { TOXICITY: {} },
        }
      );

      res.status(200).json(response.data);
    } catch (error) {
      console.error("Perspective API error:", error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Example 3: Paystack Transaction Initialization
 */
exports.initializePaystack = onRequest({
  secrets: [paystackSecretKey]
}, (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const paystack = getPaystackClient(); // Automatically accesses paystackSecretKey.value()
      const { email, amount } = req.body;

      const response = await paystack.transaction.initialize({
        email,
        amount: amount * 100, // Amount in kobo
      });

      res.status(200).json(response.data);
    } catch (error) {
      console.error("Paystack error:", error);
      res.status(500).json({ error: error.message });
    }
  });
});
