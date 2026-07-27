// ====================== SAFE RATE LIMITING CLOUD FUNCTION ======================

exports.checkRateLimit = functions.https.onCall(async (data, context) => {
  // Ensure user is authenticated
  if (!context.auth) {
    throw new functions.https.HttpsError("unauthenticated", "Must be logged in.");
  }

  const userId = context.auth.uid;
  const action = data.action || "general_action";
  const maxCalls = data.maxCalls || 5;
  const windowMinutes = data.windowMinutes || 60;

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
      return true; // Allowed
    }

    const docData = doc.data();
    
    // Reset window if expired
    if (docData.lastRequest.toDate() < windowStart) {
      await rateDocRef.set({
        count: 1,
        firstRequest: now,
        lastRequest: now
      });
      return true; // Allowed
    }

    // Check limit
    if (docData.count >= maxCalls) {
      return false; // Rate limited
    }

    // Increment counter
    await rateDocRef.update({
      count: admin.firestore.FieldValue.increment(1),
      lastRequest: now
    });

    return true; // Allowed

  } catch (error) {
    console.error("Rate limit check failed:", error);
    return true; // Fail open (allow action)
  }
});

console.log("🚀 VocalWitness Cloud Functions Ready");
