const functions = require('firebase-functions');
const admin = require('firebase-admin');
const paystack = require('paystack-api')(functions.config().paystack.secret_key);

admin.initializeApp();
const db = admin.firestore();

// ====================== EXISTING CODE (Unchanged) ======================
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
    reputationScore: 50,
    trustCircle: 0,
    level: 1,
    isPhoneVerified: false,
    phoneNumber: "",
    zkVerified: false,
    verifiedAt: null,
    testimoniesCount: 0,
    verificationsMade: 0,
    endorsementsReceived: 0,
    successfulEvidence: 0,
    debunkedEvidence: 0,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLogin: admin.firestore.FieldValue.serverTimestamp(),
    bio: "Just joined the Citizen Talk room.",
    location: "",
    badges: ["casual_talker"]
  };

  try {
    await db.collection('users').doc(userId).set(defaultCitizenData);
    console.log(`✅ Created profile for: ${userId}`);
    return null;
  } catch (error) {
    console.error(`Error creating profile for ${userId}:`, error);
    return null;
  }
});

// Gentle Moderation
async function gentleModerationCheck(content = "") {
  if (!content || content.length < 5) return { safe: true, note: "" };

  const lower = content.toLowerCase().trim();
  const flags = [];

  if (lower.includes("kill") || lower.includes("hate you") || lower.includes("f*ck")) flags.push("strong language");
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

// ====================== NEW: PAYSTACK PAYMENT FUNCTIONS ======================

/** Initialize Paystack Checkout */
exports.initializePaystack = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in to make payment");
  }

  const { amount, metadata } = data;   // amount in kobo

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

/** Paystack Webhook */
exports.paystackWebhook = functions.https.onRequest(async (req, res) => {
  const secret = functions.config().paystack.secret_key;
  const hash = req.headers["x-paystack-signature"];

  const crypto = require("crypto");
  const expectedHash = crypto.createHmac("sha512", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  if (hash !== expectedHash) {
    console.error("Invalid webhook signature");
    return res.status(400).send("Invalid signature");
  }

  const event = req.body;

  if (event.event === "charge.success") {
    const { metadata } = event.data;
    const userId = metadata.userId;

    if (userId) {
      try {
        await db.collection("users").doc(userId).update({
          supporterTier: "supporter",
          isPremium: true,
          supporterSince: admin.firestore.FieldValue.serverTimestamp(),
          totalContributed: admin.firestore.FieldValue.increment(event.data.amount / 100)
        });

        await admin.auth().setCustomUserClaims(userId, { supporter: true });

        console.log(`✅ Supporter status granted to user: ${userId}`);
      } catch (err) {
        console.error("Failed to update supporter status:", err);
      }
    }
  }

  res.sendStatus(200);
});

// ====================== SAFE RATE LIMITING HELPER ======================

/**
 * Simple Firestore-based rate limiter
 * Usage: await checkRateLimit(userId, "create_testimony", 5, 60)
 *        → max 5 testimonies per 60 minutes
 */
async function checkRateLimit(userId, action, maxCalls = 5, windowMinutes = 60) {
  if (!userId) return false;

  const now = admin.firestore.Timestamp.now();
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000);
  
  const rateDocRef = db.collection('rateLimits').doc(`${userId}_${action}`);
  
  try {
    const doc = await rateDocRef.get();
    
    if (!doc.exists) {
      await rateDocRef.set({
        count: 1,
        firstRequest: now,
        lastRequest: now
      });
      return true;
    }

    const data = doc.data();
    
    // Reset window if expired
    if (data.lastRequest.toDate() < windowStart) {
      await rateDocRef.set({
        count: 1,
        firstRequest: now,
        lastRequest: now
      });
      return true;
    }

    // Check limit
    if (data.count >= maxCalls) {
      return false; // Rate limited
    }

    // Increment counter
    await rateDocRef.update({
      count: admin.firestore.FieldValue.increment(1),
      lastRequest: now
    });

    return true;

  } catch (error) {
    console.error("Rate limit check failed:", error);
    return true; // Fail open (allow the action) to avoid blocking users
  }
}

// Export it so other functions can use it
exports.checkRateLimit = checkRateLimit;

console.log("🚀 VocalWitness Cloud Functions Ready");
