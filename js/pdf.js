PDF 
function getTier(trustScore) {
    if (trustScore >= 100) return { name: 'Premium', color: 'gold' };
    if (trustScore >= 80)  return { name: 'Gold', color: '#FFD700' };
    if (trustScore >= 60)  return { name: 'Silver', color: '#C0C0C0' };
    if (trustScore >= 40)  return { name: 'Bronze', color: '#CD7F32' };
    return { name: 'Standard', color: 'gray' };
}

The Proposed Tier RoadmapLevelRangeStatusCapabilityExplorer0% - 39%OnboardingCommunity viewing, participating in discussions.Bronze40% - 59%VerifiedPDF download access, higher reputation weight.Silver60% - 79%TrustedPriority support, advanced moderation tools.Gold80% - 99%Elite WitnessGovernance privileges, network-wide impact.Premium100%Verified Truth-BearerFull access, elite badge, system immunity.

function getTier(trustScore) {
    if (trustScore >= 100) return { name: 'Premium', color: 'gold', canDownload: true };
    if (trustScore >= 80)  return { name: 'Gold', color: '#FFD700', canDownload: true };
    if (trustScore >= 60)  return { name: 'Silver', color: '#C0C0C0', canDownload: true };
    if (trustScore >= 40)  return { name: 'Bronze', color: '#CD7F32', canDownload: true };
    
    // Below 40%
    return { name: 'Explorer', color: '#808080', canDownload: false };
}

// Usage in your UI:
const userStatus = getTier(currentUser.trustScore);
if (userStatus.canDownload) {
    // Show the "Download PDF" button
} else {
    // Show "Reach 40% trust to unlock PDF downloads" tooltip
}

Phase 1: The Gatekeeper (UI/UX)

Notification text: "This document is a Verifiable Credential. It is cryptographically linked to your VocalWitness Truth Ledger record. By downloading, you agree that any alteration to this file will invalidate its authenticity."


Pre-Download" Notification:The Status Check:
Phase 2: The Ledger (The "Engraving" Logic) const docId = crypto.randomUUID(); // Or a Firebase push ID
await setDoc(doc(db, "verifiable_docs", docId), {
    userId: user.uid,
    createdAt: new Date(),
    status: "active",
    hash: "..." // Optional: add a file hash here for extra security
});
Phase 3: The Validator (The Public Verification Page)
You need one simple page (verify.html) that anyone can use to check if a document is real.
How it works: When someone scans the QR code, it opens your site with the id in the URL.

The Script:

Read the id from the URL.

Query your verifiable_docs collection in Firestore.

If it exists -> "✅ This is a genuine VocalWitness document."

If it doesn't -> "❌ Warning: This document is not in our ledger or has been revoked."


Create verify.html: Keep it simple. It just needs a <div id="result">Checking...</div>.

Add logic to main.js: Ensure the download button is only active if trustLevel >= 40.

Use qrcode.js: Add this library to your project to turn the unique ID into a graphic that you can place inside your PDF layout.

The verify.html Template
<!DOCTYPE html>
<html>
<body>
    <h1>VocalWitness Integrity Check</h1>
    <div id="status">Verifying document...</div>

    <script type="module">
        import { initializeApp } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-app.js";
        import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/9.0.0/firebase-firestore.js";

        // Initialize Firebase (Use your existing config)
        const app = initializeApp({...}); 
        const db = getFirestore(app);

        async function verifyDoc() {
            const urlParams = new URLSearchParams(window.location.search);
            const docId = urlParams.get('id');
            const statusDiv = document.getElementById('status');

            if (!docId) { statusDiv.innerText = "❌ Invalid Request"; return; }

            const docRef = doc(db, "verifiable_docs", docId);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                statusDiv.innerHTML = "✅ <b>AUTHENTIC:</b> This document is verified by the VocalWitness Ledger.";
            } else {
                statusDiv.innerHTML = "❌ <b>FORGERY ALERT:</b> This document does not exist in our ledger.";
            }
        }
        verifyDoc();
    </script>
</body>
</html>

The "Fair" Trust Score Strategy
To make the Trust Score fair but hard to earn, you should move away from simple counts and toward a Weighted Reputation Model.

WITNESS TOKEN

Firebase Strategy:
Use a Cloud Function (server-side) to calculate this
Trigger: Whenever a "Testimony" document is added to Firestore.

Logic:

Fetch the user's current trust data.

Check for "Community Consensus" (do other witnesses confirm this testimony?).

Update the trustScore field in the users collection.

Implementing the "Witness Token" "Witness Token ID"
Engraving: When you print that QR code on the PDF, you are literally engraving the "Witness Token" into the document's DNA. If the document is printed, the physical paper now holds a digital link back to your immutable truth ledger
