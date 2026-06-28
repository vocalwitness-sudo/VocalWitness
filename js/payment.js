// js/payment.js - Global + Nigeria Friendly (Flutterwave)
import { showToast } from './utils.js';

export function initiateGuardianPayment(user) {
    const amount = 4990; // ₦4,990 or equivalent

    FlutterwaveCheckout({
        public_key: "YOUR_FLUTTERWAVE_PUBLIC_KEY",
        tx_ref: "guardian-" + Date.now(),
        amount: amount,
        currency: "NGN",
        payment_options: "card,banktransfer,ussd,applepay,googlepay",
        customer: {
            email: user.email,
            name: user.displayName || "Guardian Witness",
            phone_number: user.phone || "",
        },
        customizations: {
            title: "VocalWitness - Guardian Witness",
            description: "Support Truth • Evidence • Public Square",
            logo: "https://yourdomain.com/logo.png",
        },
        callback: function (response) {
            console.log("✅ Payment successful", response);
            verifyGuardianPayment(response.tx_ref, user.uid);
        },
        onClose: function() {
            showToast("Payment window closed", "info");
        }
    });
}

// After payment → update user tier
async function verifyGuardianPayment(txRef, userId) {
    showToast("Verifying your Guardian status...", "info");
    
    // Call your backend (Firebase function) to verify and upgrade user
    try {
        // Example:
        // await fetch('/api/verify-flutterwave', { method: 'POST', body: JSON.stringify({txRef, userId}) });
        
        showToast("🛡️ Welcome Guardian Witness! Thank you for protecting the Square.", "success");
        
        // Refresh UI or reload user data
        location.reload();
    } catch (e) {
        showToast("Payment verified but upgrade pending. Contact support if needed.", "error");
    }
}
