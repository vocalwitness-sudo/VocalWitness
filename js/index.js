const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// === EXISTING USER PROFILE INITIALIZER (kept unchanged) ===
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

// ====================== GENTLE MODERATION (New) ======================
async function gentleModerationCheck(content = "") {
  if (!content || content.length < 5) return { safe: true, note: "" };

  const lower = content.toLowerCase().trim();
  const flags = [];

  // Gentle, friendly checks
  if (lower.includes("kill") || lower.includes("hate you") || lower.includes("f*ck")) flags.push("strong language/emotion");
  if (/!{3,}/.test(content)) flags.push("very intense tone");
  if (lower.length > 800) flags.push("very long message");

  if (flags.length > 0) {
    return {
      safe: false,
      note: "This testimony feels very passionate. Consider softening a bit so others can better receive and understand your truth?",
      flags
    };
  }
  return { safe: true, note: "Looks good" };
}

// Auto-run gentle moderation when new testimony is created
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

      if (!result.safe) {
        console.log(`⚠️ Gently flagged post ${postId}`);
      } else {
        console.log(`✅ Post ${postId} passed gentle moderation`);
      }
    } catch (err) {
      console.error("Moderation error for", postId, err);
    }
  });

console.log("🚀 VocalWitness Functions with Gentle Moderation Ready");
