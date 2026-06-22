// js/payment.js
export function initiatePayment(userEmail, amountInKobo, onSuccess) {
    const handler = PaystackPop.setup({
        key: 'YOUR_PUBLIC_KEY_HERE', // Use your Live Key from Paystack
        email: userEmail,
        amount: amountInKobo,
        currency: 'NGN',
        callback: function(response) {
            console.log("Payment successful:", response.reference);
            onSuccess(response); // Trigger state update in Firestore
        },
        onClose: function() {
            alert('Transaction was not completed.');
        }
    });
    handler.openIframe();
}
