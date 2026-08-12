const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });
const paystack = require('paystack-api')(functions.config().paystack.secret_key);
const snarkjs = require('snarkjs');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

admin.initializeApp();
const db = admin.firestore();

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
// USER INITIALIZATION
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

    // Roles & Tiers
    role: "citizen",
    tier: "citizen",

    // Scores
    reputationScore: 50,
    trustCircle: 0,
    level: 1,

    // Verification
    isPhoneVerified: false,
    isVerified: false,
    phoneNumber: "",
    zkVerified: false,
    verifiedAt: null,

    // Activity metrics
    testimoniesCount: 0,
    verificationsMade: 0,
    endorsementsReceived: 0,
    successfulEvidence: 0,
    debunkedEvidence: 0,
    successfulEscalations: 0,
    communityEndorsements: 0,

    // Live Arena
    interestedInArena: false,

    // Timestamps
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLogin: admin.firestore.FieldValue.serverTimestamp(),

    // Profile
    bio: "Just joined the Citizen Talk room.",
    location: "",
    badges: ["casual_talker"]
  };

  try {
    await db.collection('users').doc(userId).set(defaultCitizenData, { merge: true });

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

    console.log(`✅ Created profile for: ${userId}`);
    return null;
  } catch (error) {
    console.error(`Error creating profile for ${userId}:`, error);
    return null;
  }
});

// ======================================================
// TRUST TIER SERVER EVALUATION
// ======================================================
exports.evaluateTrustTier = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required.");
  }

  const uid = context.auth.uid;
  const userRef = db.collection('users').doc(uid);

  try {
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new functions.https.HttpsError("not-found", "User record not found.");
    }

    const u = userSnap.data();
    let newTier = 'citizen';

    const isVerified = u.isVerified || u.isPhoneVerified || u.zkVerified;
    const testimonies = u.testimoniesCount || 0;
    const verifications = u.verificationsMade || 0;
    const score = u.reputationScore || 0;

    if (score >= 1000 && testimonies >= 20 && isVerified) {
      newTier = 'steward';
    } else if (score >= 500 && testimonies >= 10 && verifications >= 15) {
      newTier = 'elite_witness';
    } else if (isVerified || (score >= 150 && verifications >= 5)) {
      newTier = 'verified_citizen';
    }

    if (newTier !== u.tier) {
      await userRef.update({
        tier: newTier,
        tierUpdatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      if (newTier === 'steward') {
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
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// ======================================================
// CUSTOM CLAIMS MANAGEMENT
// ======================================================
exports.setUserClaims = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "You must be signed in.");
  }

  if (!context.auth.token.admin) {
    throw new functions.https.HttpsError("permission-denied", "Only admins can set custom claims.");
  }

  const { uid, claims } = data;

  if (!uid || typeof uid !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "A valid uid is required.");
  }

  if (!claims || typeof claims !== "object") {
    throw new functions.https.HttpsError("invalid-argument", "Claims object is required.");
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
      performedBy: context.auth.uid,
      targetId: uid,
      targetType: "user",
      details: { claimsSet: newClaims, finalClaims },
      severity: "high"
    });

    return { success: true, claims: finalClaims };
  } catch (error) {
    console.error("Error setting custom claims:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

exports.banUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }

  const isAllowed = context.auth.token.admin || context.auth.token.moderator;
  if (!isAllowed) {
    throw new functions.https.HttpsError("permission-denied", "Only admins or moderators can ban users.");
  }

  const { uid, reason = "No reason provided" } = data;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "uid is required");
  }

  try {
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
      bannedBy: context.auth.uid
    }, { merge: true });

    await writeAuditLog({
      action: "ban_user",
      performedBy: context.auth.uid,
      targetId: uid,
      targetType: "user",
      details: { reason },
      severity: "high"
    });

    return { success: true, message: `User ${uid} has been banned.` };
  } catch (error) {
    console.error("Ban user error:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

exports.unbanUser = functions.https.onCall(async (data, context) => {
  if (!context.auth?.token?.admin) {
    throw new functions.https.HttpsError("permission-denied", "Only admins can unban users.");
  }

  const { uid } = data;
  if (!uid) {
    throw new functions.https.HttpsError("invalid-argument", "uid is required");
  }

  try {
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
      unbannedBy: context.auth.uid
    }, { merge: true });

    await writeAuditLog({
      action: "unban_user",
      performedBy: context.auth.uid,
      targetId: uid,
      targetType: "user",
      severity: "medium"
    });

    return { success: true, message: `User ${uid} has been unbanned.` };
  } catch (error) {
    console.error("Unban user error:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

exports.moderatedDelete = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Sign in required.");
  }

  const isMod = context.auth.token.moderator === true || context.auth.token.admin === true;
  if (!isMod) {
    throw new functions.https.HttpsError("permission-denied", "Only moderators or admins can perform moderated deletes.");
  }

  const { collection, docId, reason = "No reason provided" } = data;

  if (!collection || !docId) {
    throw new functions.https.HttpsError("invalid-argument", "collection and docId are required.");
  }

  const allowedCollections = [
    "testimonies", "posts", "feeds", "groups",
    "witnessCycles", "dao_proposals", "reports"
  ];

  if (!allowedCollections.includes(collection)) {
    throw new functions.https.HttpsError("invalid-argument", "Collection not allowed.");
  }

  try {
    const docRef = db.collection(collection).doc(docId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new functions.https.HttpsError("not-found", "Document does not exist.");
    }

    const originalData = docSnap.data();

    await docRef.delete();

    await writeAuditLog({
      action: "moderator_delete",
      performedBy: context.auth.uid,
      targetId: docId,
      targetType: collection,
      details: {
        reason,
        originalAuthor: originalData.authorId || originalData.ownerId || originalData.witnessId || null,
        contentPreview: originalData.content ? String(originalData.content).substring(0, 200) : null
      },
      severity: "high"
    });

    return { success: true, message: `Document deleted and audited.` };
  } catch (error) {
    console.error("Moderated delete error:", error);
    throw new functions.https.HttpsError("internal", error.message);
  }
});

// ======================================================
// GENTLE MODERATION
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
  .document('testimonies/{postId}')
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
// PAYSTACK
// ======================================================
exports.initializePaystack = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in to make payment");
  }

  const { amount, metadata } = data;

  if (!amount || amount < 1000) {
    throw new functions.https.HttpsError("invalid-argument", "Amount too small");
  }

  try {
    const transaction = await paystack.transaction.initialize({
      amount: amount,
      email: context.auth.token.email || "supporter@vocalwitness.app",
      reference: `VW_${Date.now()}_${Math.floor(Math.random() * 100000)}`,
      metadata: { ...metadata, userId: context.auth.uid }
    });

    return {
      authorization_url: transaction.data.authorization_url,
      reference: transaction.data.reference
    };
  } catch (error) {
    console.error("Paystack Error:", error);
    throw new functions.https.HttpsError("internal", "Payment initialization failed");
  }
});

exports.paystackWebhook = functions.https.onRequest(async (req, res) => {
  const secret = functions.config().paystack.secret_key;
  const hash = req.headers["x-paystack-signature"];

  const expectedHash = crypto
    .createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== expectedHash) {
    console.error("Invalid webhook signature");
    return res.status(400).send("Invalid signature");
  }

  const event = req.body;

  if (event.event === "charge.success") {
    const { metadata } = event.data;
    const userId = metadata?.userId;

    if (userId) {
      try {
        await db.collection("users").doc(userId).update({
          supporterTier: "supporter",
          isPremium: true,
          supporterSince: admin.firestore.FieldValue.serverTimestamp(),
          totalContributed: admin.firestore.FieldValue.increment(event.data.amount / 100)
        });

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
          details: { amount: event.data.amount / 100 },
          severity: "info"
        });

        console.log(`✅ Supporter status granted to user: ${userId}`);
      } catch (err) {
        console.error("Failed to update supporter status:", err);
      }
    }
  }

  res.sendStatus(200);
});

// ======================================================
// RATE LIMITING
// ======================================================
exports.checkRateLimit = functions.https.onRequest((req, res) => {
  return cors(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Origin', '*');
      res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      return res.status(204).send('');
    }

    res.set('Access-Control-Allow-Origin', '*');

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
      userId = req.ip ? req.ip.replace(/[\.\:]/g, '_') : 'anonymous_user';
    }

    const action = req.body?.action || "general_action";
    const maxCalls = req.body?.maxCalls || 5;
    const windowMinutes = req.body?.windowMinutes || 60;
    const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);

    const rateDocRef = db.collection('rateLimits').doc(`${userId}_${action}`);
    const now = admin.firestore.Timestamp.now();

    try {
      const doc = await rateDocRef.get();

      if (!doc.exists) {
        await rateDocRef.set({
          count: 1,
          firstRequest: now,
          lastRequest: now
        });
        return res.status(200).json({ allowed: true });
      }

      const docData = doc.data();

      if (docData.lastRequest.toDate() < windowStart) {
        await rateDocRef.set({
          count: 1,
          firstRequest: now,
          lastRequest: now
        });
        return res.status(200).json({ allowed: true });
      }

      if (docData.count >= maxCalls) {
        return res.status(200).json({ allowed: false });
      }

      await rateDocRef.update({
        count: admin.firestore.FieldValue.increment(1),
        lastRequest: now
      });

      return res.status(200).json({ allowed: true });
    } catch (error) {
      console.error("Rate limit check failed:", error);
      return res.status(200).json({ allowed: true });
    }
  });
});

// ======================================================
// ZK PROOF VERIFICATION
// ======================================================
exports.verifyZKProof = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Authentication required to submit ZK proof.");
  }

  const { proof, publicSignals } = data;

  if (!proof || !publicSignals) {
    throw new functions.https.HttpsError("invalid-argument", "Missing proof or public signals payload.");
  }

  try {
    const keyPath = path.join(__dirname, 'verification_key.json');
    if (!fs.existsSync(keyPath)) {
      throw new Error("Verification key not found on server.");
    }

    const vKey = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    const isValid = await snarkjs.groth16.verify(vKey, publicSignals, proof);

    if (!isValid) {
      return { success: false, reason: "Proof validation failed." };
    }

    await db.collection('users').doc(context.auth.uid).update({
      zkVerified: true,
      verifiedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await writeAuditLog({
      action: "zk_verified",
      performedBy: context.auth.uid,
      targetId: context.auth.uid,
      targetType: "user",
      severity: "info"
    });

    console.log(`🔐 ZK Proof verified for user: ${context.auth.uid}`);
    return { success: true };
  } catch (error) {
    console.error("ZK Verification Cloud Error:", error);
    throw new functions.https.HttpsError("internal", error.message || "Failed to verify ZK proof.");
  }
});

// ======================================================
// STEWARD PROMOTION
// ======================================================
exports.promoteToSteward = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be authenticated to request promotion.');
  }

  const uid = context.auth.uid;
  const userRef = db.collection('users').doc(uid);

  try {
    const userSnap = await userRef.get();
    if (!userSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'User record not found.');
    }

    const userData = userSnap.data();

    const testimonies = userData.testimoniesCount || 0;
    const escalations = userData.successfulEscalations || 0;
    const endorsements = userData.communityEndorsements || userData.endorsementsReceived || 0;

    const activityScore = (testimonies * 2) + (escalations * 5) + (endorsements * 3);

    if (activityScore > 500 && userData.tier !== 'steward') {
      await userRef.update({
        tier: 'steward',
        role: 'steward',
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
    throw new functions.https.HttpsError("internal", error.message);
  }
});
