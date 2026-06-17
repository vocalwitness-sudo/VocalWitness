const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const db = admin.firestore();

// This runs automatically when a new user signs up via Email/Password
exports.initializeCitizenProfile = functions.auth.user().onCreate(async (user) => {
  const userId = user.uid;

  // Generate a casual, default username if they don't have one
  const defaultUsername = `citizen_${Math.floor(1000 + Math.random() * 9000)}`;

  const defaultCitizenData = {
    uid: userId,
    email: user.email || "",
    displayName: user.displayName || "New Citizen",
    username: defaultUsername,
    photoURL: user.photoURL || "https://placehold.co/150", // placeholder avatar
    role: "citizen", // Lung 1: Casual Citizen

    // Reputation System (Initialized but dormant for Citizens)
    reputationScore: 50,  
    trustCircle: 0,       // 0 means Locked/Not Activated
    level: 1,

    // Verification States (Unverified)
    isPhoneVerified: false,
    phoneNumber: "",
    zkVerified: false,
    verifiedAt: null,

    // Stats
    testimoniesCount: 0,
    verificationsMade: 0,
    endorsementsReceived: 0,
    successfulEvidence: 0, // Green
    debunkedEvidence: 0,   // Red

    // Metadata & Timestamps
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    lastLogin: admin.firestore.FieldValue.serverTimestamp(),
    bio: "Just joined the Citizen Talk room.",
    location: "",
    badges: ["casual_talker"] 
  };

  try {
    // Save the citizen profile to Firestore
    await db.collection('users').doc(userId).set(defaultCitizenData);
    console.log(`Successfully created casual Citizen profile for: ${userId}`);
    return null;
  } catch (error) {
    console.error(`Error initializing profile for ${userId}:`, error);
    return null;
  }
});
