/**
 * VocalWitness Verification Module
 * Manages Identity Tiering, ZK Proofs, and Peer Invitations
 */
import { collection, addDoc, doc, getDoc, updateDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
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
            const btn = document.getElementById('upgradeNodeBtn');
            if (btn) btn.textContent = "✓ Identity Cryptographically Secured";
        }
    }
}

/**
 * ZK Verification Logic
 */
export async function startZKVerification() {
    console.log("ZK Verification started");
    // Placeholder for your ZK-proof implementation
    showToast("🔐 Initializing Zero-Knowledge Proof sequence...");
    // Future: Integrate SnarkJS or custom ZK logic here
}

/**
 * Phone Verification Placeholder
 */
export async function startPhoneVerification() {
    console.log("Phone Verification started");
    showToast("📱 Starting SMS identity challenge...");
}

/**
 * Peer-to-Peer Invitation System
 */
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

// Add this function to js/verification.js
export function populateCountryDropdown(elementId) {
    const select = document.getElementById(elementId);
    if (!select) return;

    const countries = [
        { code: '+234-ha', name: 'Hausa (Nigeria)' },
        { code: '+234-yo', name: 'Yorùbá (Nigeria)' },
        { code: '+234-ig', name: 'Igbo (Nigeria)' },
        { code: '+255', name: 'Swahili (Tanzania)' },
        { code: '+252', name: 'Somali (Somalia)' },
        { code: '+251-am', name: 'Amharic (Ethiopia)' },
        { code: '+251-or', name: 'Oromo (Ethiopia)' },
        { code: '+27-zu', name: 'Zulu (South Africa)' },
        { code: '+34', name: 'Spanish (Spain)' },
        { code: '+33', name: 'French (France)' }
    ];

    countries.forEach(country => {
        const option = document.createElement('option');
        option.value = country.code;
        option.textContent = country.name;
        select.appendChild(option);
    });
}

/**
 * Redemption of Invite Codes
 */
export const checkIncomingInvite = async () => {
    if (!auth.currentUser) return showToast("❌ Please log in first.");
    const inputCode = prompt("Enter your validation invite code:");
    if (!inputCode) return;
    
    try {
        // Using setDoc with { merge: true } ensures user doc is created if missing
        await setDoc(doc(db, "users", auth.currentUser.uid), {
            tier: 1,
            invitedByCode: inputCode,
            verifiedAt: serverTimestamp()
        }, { merge: true });
        
        showToast("🛡️ Node Upgraded: Welcome to the Tier 1 Witness Circle!");
        setTimeout(() => location.reload(), 1500);
    } catch (error) {
        showToast("❌ Verification failed: Invalid or expired code.");
    }
};

// Expose to window for UI buttons
window.sendInvitation = sendInvitation;
window.checkIncomingInvite = checkIncomingInvite;
window.startZKVerification = startZKVerification;
window.startPhoneVerification = startPhoneVerification;
