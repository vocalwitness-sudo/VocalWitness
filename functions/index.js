const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.addWitnessProof = functions.https.onCall((data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated');

    const userRef = admin.firestore().collection('users').doc(data.userId);
    return userRef.update({
        trustScore: admin.firestore.FieldValue.increment(data.confidenceScore)
    });
});
