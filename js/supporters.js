import { showToast } from './utils.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { db } from './firebase-config.js';

const FLUTTERWAVE_PUBLIC_KEY = "FLWPUBK_TEST-XXXXXXXXXXXXXXXXXXXXXXXX";

/**
 * Dynamically loads the Flutterwave SDK only when a user initiates a payment.
 */
function loadFlutterwaveScript() {
    return new Promise((resolve, reject) => {
        if (window.FlutterwaveCheckout) return resolve();
        const script = document.createElement('script');
        script.id = 'flutterwave-sdk';
        script.src = 'https://checkout.flutterwave.com/v3.js';
        script.onload = resolve;
        script.onerror = reject;
        document.body.appendChild(script);
    });
}

export async function initiatePlatformSupport(user) {
    if (!user) {
        showToast("Please sign in first", "error");
        return;
    }

    try {
        showToast("Loading payment portal...", "info");
        await loadFlutterwaveScript();
        
        FlutterwaveCheckout({
            public_key: FLUTTERWAVE_PUBLIC_KEY,
            tx_ref: "VW-SUP-" + Date.now(),
            amount: 4990,
            currency: "NGN",
            payment_options: "card, banktransfer, ussd, mobilemoney",
            customer: {
                email: user.email || "user@vocalwitness.app",
                name: user.displayName || "VocalWitness User"
            },
            customizations: {
                title: "VocalWitness Platform Support",
                description: "Monthly Supporter - ₦4,990",
                logo: "https://vocalwitness-3affa.web.app/logo.png"
            },
            callback: async function(response) {
                if (response.status === "successful") {
                    await updateUserAsSupporter(user.uid, response.tx_ref);
                    showToast("✅ Thank you! You are now a Platform Supporter 💚", "success");
                    document.getElementById('supportersModal')?.classList.add('hidden');
                }
            },
            onClose: () => showToast("Payment cancelled", "info")
        });
    } catch (err) {
        console.error("Payment error:", err);
        showToast("Failed to open payment system.", "error");
    }
}

async function updateUserAsSupporter(userId, txRef) {
    await setDoc(doc(db, "users", userId), {
        isPlatformSupporter: true,
        supporterSince: new Date().toISOString(),
        lastSupportTx: txRef,
        supportAmount: 4990
    }, { merge: true });
}
