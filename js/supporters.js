// js/supporters.js - Platform Supporters Logic

// Global function called from HTML button
window.initiatePlatformSupport = async (user) => {
    if (!user) {
        return showToast("Please sign in first", "error");
    }

    showToast("Opening payment flow...", "info");

    try {
        // Example: Paystack / Stripe integration placeholder
        // Replace with your actual payment provider
        const paymentSuccess = await processMonthlySupport(user.uid);

        if (paymentSuccess) {
            await updateUserAsSupporter(user.uid);
            showToast("✅ Thank you! You are now a Platform Supporter", "success");
            
            // Optional: Refresh profile or show badge
            if (typeof refreshProfile === 'function') refreshProfile();
        }
    } catch (err) {
        console.error(err);
        showToast("Payment failed. Please try again.", "error");
    }
};

// Mock payment processor (replace with real Paystack/Stripe)
async function processMonthlySupport(userId) {
    // TODO: Integrate real payment (Paystack inline or Stripe)
    console.log(`Processing ₦4,990 support for user: ${userId}`);
    
    // Simulate success for now
    return new Promise(resolve => setTimeout(() => resolve(true), 1500));
}

// Update Firestore user document
async function updateUserAsSupporter(userId) {
    const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js");
    const { db } = await import('./firebase-config.js');
    
    await setDoc(doc(db, "users", userId), {
        isPlatformSupporter: true,
        supporterSince: new Date().toISOString(),
        lastPayment: new Date().toISOString()
    }, { merge: true });
}

// Optional: Check supporter status
window.isPlatformSupporter = async (userId) => {
    // Add Firestore query logic here
    return false; // placeholder
};
