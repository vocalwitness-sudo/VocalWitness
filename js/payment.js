// js/payment.js - Global Friendly
import { showToast } from './utils.js';

let paymentProcessor = 'stripe'; // 'stripe' or 'paystack'

// Initialize Guardian Payment
export function initiateGuardianPayment(user, onSuccess) {
    const amount = 4.99; // USD equivalent (~₦4990)

    if (paymentProcessor === 'paystack' && user.country === 'NG') {
        // Use Paystack for Nigerians
        initiatePaystackPayment(user.email, amount, onSuccess);
    } else {
        // Use Stripe for everyone else (and Nigerians who prefer it)
        initiateStripePayment(user, amount, onSuccess);
    }
}

// Paystack (Nigeria)
function initiatePaystackPayment(email, amountInUSD, onSuccess) {
    const amountInKobo = Math.round(amountInUSD * 1650 * 100); // rough conversion
    
    const handler = PaystackPop.setup({
        key: 'YOUR_PAYSTACK_PUBLIC_KEY',
        email: email,
        amount: amountInKobo,
        currency: 'NGN',
        callback: (response) => onSuccess(response),
        onClose: () => showToast("Payment cancelled", "info")
    });
    handler.openIframe();
}

// Stripe (International + Nigeria)
async function initiateStripePayment(user, amountUSD, onSuccess) {
    showToast("Connecting to secure payment...", "info");
    
    try {
        // Call your backend to create a checkout session
        const response = await fetch('https://your-backend.com/create-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: user.email,
                amount: amountUSD,
                userId: user.uid,
                tier: 'guardian_witness'
            })
        });

        const { sessionId } = await response.json();

        // Redirect to Stripe Checkout
        const stripe = Stripe('YOUR_STRIPE_PUBLISHABLE_KEY');
        await stripe.redirectToCheckout({ sessionId });

    } catch (err) {
        console.error(err);
        showToast("Payment initialization failed. Try again.", "error");
    }
}
