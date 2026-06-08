/**
 * VocalWitness Verification Module
 * Manages Identity Tiering, ZK Proofs, and Peer Invitations
 */
import { collection, addDoc, doc, getDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { db, auth } from "./firebase-config.js";
import { showToast } from "./utils.js";

// State
export let isPhoneVerified = false;
export let isZKVerified = false;

/**
 * Checks Firestore on startup to see if user has already been verified
 */
export async function checkInitialVerificationStatus() {
    if (!auth.currentUser) return;
    const userSnap = await getDoc(doc(db, "users", auth.currentUser.uid));
    if (userSnap.exists()) {
        const userData = userSnap.data();
        if (userData.tier >= 1) {
            isPhoneVerified = true;
            isZKVerified = true;
            // Update UI accordingly
            const btn = document.getElementById('upgradeNodeBtn');
            if (btn) btn.textContent = "✓ Identity Cryptographically Secured";
        }
    }
}

// ... [Keep the countryCodes array, populateCountryDropdown, and startZKVerification functions here] ...

// Updated Peer-to-Peer Invitation System
export const sendInvitation = async () => {
    if (!auth.currentUser) return showToast("❌ Unauthorized: Login required.");
    
    const inviteCode = "VW-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    
    try {
        await addDoc(collection(db, "invites"), {
            from: auth.currentUser.uid,
            code: inviteCode,
            status: "pending",
            createdAt: serverTimestamp()
        });
        
        await navigator.clipboard.writeText(`${window.location.origin}?invite=${inviteCode}`);
        showToast("📋 Invitation link copied to clipboard.");
    } catch (error) {
        console.error(error);
        showToast("❌ Invite generation failed.");
    }
};

export const checkIncomingInvite = async () => {
    if (!auth.currentUser) return showToast("❌ Please log in first.");
    const inputCode = prompt("Enter your validation invite code:");
    if (!inputCode) return;
    
    try {
        await updateDoc(doc(db, "users", auth.currentUser.uid), {
            tier: 1,
            invitedByCode: inputCode,
            verifiedAt: serverTimestamp()
        });
        showToast("🛡️ Node Upgraded: Welcome to the Tier 1 Witness Circle!");
        setTimeout(() => location.reload(), 1500);
    } catch (error) {
        showToast("❌ Verification failed: Invalid or expired code.");
    }
};

// Expose to window for UI
window.sendInvitation = sendInvitation;
window.checkIncomingInvite = checkIncomingInvite;
window.startZKVerification = startZKVerification;
window.startPhoneVerification = startPhoneVerification;
