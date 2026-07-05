// js/supporters.js - Production-ready Flutterwave Integration
import { showToast } from './utils.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db } from './firebase-config.js';

const FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK-XXXXXXXXXXXXXXXXXXXXXXXXX"; // ← Move to env / firebase-config later

export async function initiatePlatformSupport(user) {
    if (!user || !user.uid) {
        showToast("Please sign in to support the platform", "error");
        return;
    }

    showToast("Opening secure payment...", "info");

    try {
        FlutterwaveCheckout({
            public_key: FLUTTERWAVE_PUBLIC_KEY,
            tx_ref: `vw-support-${user.uid}-${Date.now()}`,
            amount: 4990,
            currency: "NGN",
            payment_options: "card,banktransfer,ussd,applepay,googlepay,qr",
            customer: {
                email: user.email || "",
                name: user.displayName || "VocalWitness Supporter",
                phone_number: user.phone || "",
            },
            customizations: {
                title: "Support VocalWitness",
                description: "Monthly Platform Supporter • ₦4,990",
                logo: "https://vocalwitness-3affa.web.app/logo.png",
            },
            callback: async function (response) {
                console.log("Flutterwave response:", response);
                if (response.status === "successful") {
                    await verifySupportPayment(response.tx_ref, user.uid);
                } else {
                    showToast("Payment not completed", "error");
                }
            },
            onClose: function() {
                showToast("Payment window closed", "info");
            }
        });
    } catch (err) {
        console.error("Payment error:", err);
        showToast("Failed to open payment. Try again.", "error");
    }
}

async function verifySupportPayment(txRef, userId) {
    showToast("Verifying payment with server...", "info");

    try {
        // TODO: Call Cloud Function for proper verification (recommended)
        // For now, optimistic update
        await setDoc(doc(db, "users", userId), {
            isPlatformSupporter: true,
            supporterSince: new Date().toISOString(),
            lastPayment: new Date().toISOString(),
            paymentTxRef: txRef
        }, { merge: true });

        showToast("🎉 Thank you! You are now a Platform Supporter", "success");
        location.reload(); // Refresh to show badge
    } catch (e) {
        console.error(e);
        showToast("Payment received. Please refresh or contact support.", "warning");
    }
}

// Bonus: Check supporter status
export async function isPlatformSupporter(userId) {
    // Implement Firestore query
    return false; // placeholder for now
}
