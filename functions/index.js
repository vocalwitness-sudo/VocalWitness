/**
 * Cloud Functions for Firebase / Cloudflare R2 Integration
 * Stack: Firebase Functions v1 & v2 / Express / AWS SDK v3 / SnarkJS / Paystack
 */

const functions = require("firebase-functions");
const { onRequest, onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const cors = require("cors")({ origin: true });
const paystackApi = require("paystack-api");
const snarkjs = require("snarkjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}
const db = admin.firestore();

// Define Secrets for Firebase Secrets Manager
const r2AccessKeyId = defineSecret("R2_ACCESS_KEY_ID");
const r2SecretAccessKey = defineSecret("R2_SECRET_ACCESS_KEY");
const paystackSecretKey = defineSecret("PAYSTACK_SECRET_KEY");

// Initialize Paystack client lazily using Secret Manager or fallback config
const getPaystackClient = () => {
  const secret = paystackSecretKey.value() || functions.config().paystack?.secret_key;
  return paystackApi(secret);
};

// ======================================================
// AUDIT LOG HELPER
// ======================================================
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
      action,
      performedBy,
      targetId,
      targetType,
      details,
      severity,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: new Date().toISOString()
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

// ======================================================
// 1. CLOUDFLARE R2 PRE-SIGNED URL GENERATOR
// ======================================================
exports.getUploadUrl = onRequest(
  {
    cors: true,
    secrets: [r2AccessKeyId, r2SecretAccessKey]
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      return res.status(204).send("");
    }

    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
      // Security Check: Verify Bearer Token
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Unauthorized. ID token required." });
      }

      const idToken = authHeader.split("Bearer ")[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      const { fileName, fileType } = req.body;
      if (!fileName || !fileType) {
        return res.status(400).json({ error: "fileName and fileType are required parameters." });
      }

      // Initialize AWS S3 Client for Cloudflare R2
      const s3Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT || "https://b282f46ef0831c8af75bfe52120bbac6.r2.cloudflarestorage.com",
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

      return res.status(200).json({
        uploadUrl,
        publicUrl,
        key: objectKey,
      });
    } catch (error) {
      console.error("Error generating pre-signed URL:", error);
      return res.status(500).json({ error: "Failed to generate upload URL." });
    }
  }
);

// ======================================================
// 2. USER INITIALIZATION
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
    phoneNumber: "",
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
      details: { email: user.email || null },
      severity: "info"
    });

    console.log(`✅ Created profile for user: ${userId}`);
    return null;
  } catch (error) {
    console.error(`Error creating profile for ${userId}:`, error);
    return null;
  }
});

// ======================================================
// 3. TRUST TIER SERVER EVALUATION
// ======================================================
exports.evaluateTrustTier = onCall(async (request) => {
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

    const isVerified = u.isVerified || u.isPhoneVerified || u.zkVerified;
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
    throw new HttpsError("internal", error.message);
  }
});

// ======================================================
// 4. CUSTOM CLAIMS & USER MANAGEMENT
// ======================================================
exports.setUserClaims = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }

  if (!request.auth.token.admin) {
    throw new HttpsError("permission-denied", "Only admins can set custom claims.");
  }

  const { uid, claims } = request.data;

  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "A valid uid is required.");
  }

  if (!claims || typeof claims !== "object") {
    throw new HttpsError("invalid-argument", "Claims object is required.");
  }

  const allowed = ["admin", "moderator", "banned", "supporter", "steward"];
  const newClaims = {};

  allowed.forEach((key) => {
    if (key in claims) {
      newClaims[key] = Boolean(claims[key]);
    }
  });

  try {
    const userRecord = await admin.auth().getUser(uid);
    const existingClaims = userRecord.customClaims || {};

    const finalClaims = {
      ...existingClaims,
      ...newClaims
    };

    await admin.auth().setCustomUserClaims(uid, finalClaims);

    await db.collection("users").doc(uid).set({
      isAdmin: finalClaims.admin === true,
      isModerator: finalClaims.moderator === true,
      isBanned: finalClaims.banned === true,
      isSupporter: finalClaims.supporter === true,
      isSteward: finalClaims.steward === true,
      claimsUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

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
    throw new HttpsError("internal", error.message);
  }
});

exports.banUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const isAllowed = request.auth.token.admin || request.auth.token.moderator;
  if (!isAllowed) {
    throw new HttpsError("permission-denied", "Only admins or moderators can ban users.");
  }

  const { uid, reason = "No reason provided" } = request.data;
  if (!uid) {
    throw new HttpsError("invalid-argument", "uid is required.");
  }

  try {
    await admin.auth().updateUser(uid, { disabled: true });

    const userRecord = await admin.auth().getUser(uid);
    const existingClaims = userRecord.customClaims || {};

    await admin.auth().setCustomUserClaims(uid, {
      ...existingClaims,
      banned: true
    });

    await db.collection("users").doc(uid).set({
      isBanned: true,
      banReason: reason,
      bannedAt: admin.firestore.FieldValue.serverTimestamp(),
      bannedBy: request.auth.uid
    }, { merge: true });

    await writeAuditLog({
      action: "ban_user",
      performedBy: request.auth.uid,
      targetId: uid,
      targetType: "user",
      details: { reason },
      severity: "high"
    });

    return { success: true, message: `User ${uid} has been banned.` };
  } catch (error) {
    console.error("Ban user error:", error);
    throw new HttpsError("internal", error.message);
  }
});

exports.unbanUser = onCall(async (request) => {
  if (!request.auth?.token?.admin) {
    throw new HttpsError("permission-denied", "Only admins can unban users.");
  }

  const { uid } = request.data;
  if (!uid) {
    throw new HttpsError("invalid-argument", "uid is required.");
  }

  try {
    await admin.auth().updateUser(uid, { disabled: false });

    const userRecord = await admin.auth().getUser(uid);
    const existingClaims = userRecord.customClaims || {};

    await admin.auth().setCustomUserClaims(uid, {
      ...existingClaims,
      banned: false
    });

    await db.collection("users").doc(uid).set({
      isBanned: false,
      banReason: admin.firestore.FieldValue.delete(),
      bannedAt: admin.firestore.FieldValue.delete(),
      bannedBy: admin.firestore.FieldValue.delete(),
      unbannedAt: admin.firestore.FieldValue.serverTimestamp(),
      unbannedBy: request.auth.uid
    }, { merge: true });

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
    throw new HttpsError("internal", error.message);
  }
});

exports.moderatedDelete = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Sign in required.");
  }

  const isMod = request.auth.token.moderator === true || request.auth.token.admin === true;
  if (!isMod) {
    throw new HttpsError("permission-denied", "Only moderators or admins can perform moderated deletes.");
  }

  const { collection, docId, reason = "No reason provided" } = request.data;

  if (!collection || !docId) {
    throw new HttpsError("invalid-argument", "collection and docId are required.");
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

    if (!docSnap.exists) {
      throw new HttpsError("not-found", "Document does not exist.");
    }

    const originalData = docSnap.data();

    await docRef.delete();

    await writeAuditLog({
      action: "moderator_delete",
      performedBy: request.auth.uid,
      targetId: docId,
      targetType: collection,
      details: {
        reason,
        originalAuthor: originalData.authorId || originalData.ownerId || originalData.witnessId || null,
        contentPreview: originalData.content ? String(originalData.content).substring(0, 200) : null
      },
      severity: "high"
    });

    return { success: true, message: "Document deleted and audited." };
  } catch (error) {
    console.error("Moderated delete error:", error);
    throw new HttpsError("internal", error.message);
  }
});

// ======================================================
// 5. GENTLE MODERATION
// ======================================================
async function gentleModerationCheck(content = "") {
  if (!content || content.length < 5) return { safe: true, note: "" };

  const lower = content.toLowerCase().trim();
  const flags = [];

  if (lower.includes("kill") || lower.includes("hate you") || lower.includes("f*ck")) {
    flags.push("strong language");
  }
  if (/!{3,}/.test(content)) flags.push("very intense tone");
  if (lower.length > 800) flags.push("very long message");

  if (flags.length > 0) {
    return {
      safe: false,
      note: "This testimony feels very passionate. Consider softening a bit?",
      flags
    };
  }

  return { safe: true, note: "Looks good" };
}

exports.moderateNewTestimony = functions.firestore
  .document("testimonies/{postId}")
  .onCreate(async (snap, context) => {
    const data = snap.data();
    const postId = context.params.postId;

    try {
      const result = await gentleModerationCheck(data.content || "");

      await snap.ref.update({
        moderationChecked: true,
        moderationSafe: result.safe,
        moderationNote: result.note,
        needsHumanReview: !result.safe,
        moderatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(result.safe ? `✅ Post ${postId} passed` : `⚠️ Post ${postId} gently flagged`);
    } catch (err) {
      console.error("Moderation error for", postId, err);
    }
  });

// ======================================================
// 6. PAYSTACK INTEGRATION
// ======================================================
exports.initializePaystack = onCall(
  { secrets: [paystackSecretKey] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in to make payment.");
    }

    const { amount, metadata } = request.data;

    if (!amount || amount < 1000) {
      throw new HttpsError("invalid-argument", "Amount too small.");
    }

    try {
      const paystack = getPaystackClient();
      const transaction = await paystack.transaction.initialize({
        amount: amount,
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
      throw new HttpsError("internal", "Payment initialization failed.");
    }
  }
);

exports.paystackWebhook = onRequest(
  { secrets: [paystackSecretKey] },
  async (req, res) => {
    if (req.method !== "POST") {
      return res.status(405).send("Method Not Allowed");
    }

    const secret = paystackSecretKey.value() || functions.config().paystack?.secret_key;
    const signature = req.headers["x-paystack-signature"];

    if (!signature) {
      return res.status(400).send("Missing signature header");
    }

    // HMAC verification using req.rawBody buffer to guarantee match
    const expectedHash = crypto
      .createHmac("sha512", secret)
      .update(req.rawBody)
      .digest("hex");

    if (signature !== expectedHash) {
      console.error("Invalid Paystack webhook signature.");
      return res.status(400).send("Invalid signature payload");
    }

    const event = req.body;

    if (event.event === "charge.success") {
      const { metadata } = event.data;
      const userId = metadata?.userId;

      if (userId) {
        try {
          const amountInMainCurrency = event.data.amount / 100;

          await db.collection("users").doc(userId).set({
            supporterTier: "supporter",
            isPremium: true,
            supporterSince: admin.firestore.FieldValue.serverTimestamp(),
            totalContributed: admin.firestore.FieldValue.increment(amountInMainCurrency)
          }, { merge: true });

          const userRecord = await admin.auth().getUser(userId);
          const currentClaims = userRecord.customClaims || {};

          await admin.auth().setCustomUserClaims(userId, {
            ...currentClaims,
            supporter: true
          });

          await writeAuditLog({
            action: "supporter_granted",
            performedBy: "system",
            targetId: userId,
            targetType: "user",
            details: { amount: amountInMainCurrency, reference: event.data.reference },
            severity: "info"
          });

          console.log(`✅ Supporter status granted to user: ${userId}`);
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
// 7. RATE LIMITING (TRANSACTION-BASED)
// ======================================================
exports.checkRateLimit = onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method === "OPTIONS") {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
      return res.status(204).send("");
    }

    res.set("Access-Control-Allow-Origin", "*");

    let userId = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const idToken = authHeader.split("Bearer ")[1];
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        userId = decodedToken.uid;
      } catch (err) {
        console.warn("Invalid ID token passed to checkRateLimit:", err.message);
      }
    }

    if (!userId) {
      userId = req.ip ? req.ip.replace(/[\.\:]/g, "_") : "anonymous_user";
    }

    const action = req.body?.action || "general_action";
    const maxCalls = req.body?.maxCalls || 5;
    const windowMinutes = req.body?.windowMinutes || 60;

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
            lastRequest: now
          });
          return true;
        }

        const docData = doc.data();

        if (docData.lastRequest.toDate() < windowStart) {
          transaction.set(rateDocRef, {
            count: 1,
            firstRequest: now,
            lastRequest: now
          });
          return true;
        }

        if (docData.count >= maxCalls) {
          return false;
        }

        transaction.update(rateDocRef, {
          count: admin.firestore.FieldValue.increment(1),
          lastRequest: now
        });

        return true;
      });

      return res.status(200).json({ allowed: isAllowed });
    } catch (error) {
      console.error("Rate limit check failed:", error);
      return res.status(200).json({ allowed: true });
    }
  });
});

// ======================================================
// 8. ZERO-KNOWLEDGE PROOF VERIFICATION
// ======================================================
exports.verifyZKProof = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required to submit ZK proof.");
  }

  const { proof, publicSignals } = request.data;

  if (!proof || !publicSignals) {
    throw new HttpsError("invalid-argument", "Missing proof or public signals payload.");
  }

  try {
    const keyPath = path.join(__dirname, "verification_key.json");
    if (!fs.existsSync(keyPath)) {
      throw new Error("Verification key configuration file missing from runtime root.");
    }

    const vKey = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

    if (!isValid) {
      return { success: false, reason: "Proof validation failed." };
    }

    await db.collection("users").doc(request.auth.uid).update({
      zkVerified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await writeAuditLog({
      action: "zk_verified",
      performedBy: request.auth.uid,
      targetId: request.auth.uid,
      targetType: "user",
      severity: "info"
    });

    console.log(`🔐 ZK Proof verified for user: ${request.auth.uid}`);
    return { success: true };
  } catch (error) {
    console.error("ZK Verification Error:", error);
    throw new HttpsError("internal", error.message || "Failed to verify ZK proof.");
  }
});

// ======================================================
// 9. STEWARD PROMOTION
// ======================================================
exports.promoteToSteward = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be authenticated to request promotion.");
  }

  const uid = request.auth.uid;
  const userRef = db.collection("users").doc(uid);

  try {
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User record not found.");
    }

    const userData = userSnap.data();

    const testimonies = userData.testimoniesCount || 0;
    const escalations = userData.successfulEscalations || 0;
    const endorsements = userData.communityEndorsements || userData.endorsementsReceived || 0;

    const activityScore = (testimonies * 2) + (escalations * 5) + (endorsements * 3);

    if (activityScore > 500 && userData.tier !== "steward") {
      await userRef.update({
        tier: "steward",
        role: "steward",
        promotedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      const userRecord = await admin.auth().getUser(uid);
      const currentClaims = userRecord.customClaims || {};

      await admin.auth().setCustomUserClaims(uid, {
        ...currentClaims,
        steward: true
      });

      await writeAuditLog({
        action: "promoted_to_steward",
        performedBy: uid,
        targetId: uid,
        targetType: "user",
        details: { activityScore },
        severity: "info"
      });

      return { success: true, message: "Promoted to Steward." };
    } else {
      return { success: false, message: "Activity score threshold not met." };
    }
  } catch (error) {
    console.error("Promote to steward error:", error);
    throw new HttpsError("internal", error.message);
  }
});
