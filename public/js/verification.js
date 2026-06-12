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
 * Start Zero-Knowledge Verification
 */
export async function startZKVerification() {
    try {
        if (!auth.currentUser) {
            showToast("Please log in first", "error");
            return;
        }

        showToast("🔐 Starting ZK Verification...");

        // TODO: Add your actual ZK proof logic here later
        // For now, simulate success
        setTimeout(() => {
            isZKVerified = true;
            showToast("✅ ZK Verification Successful! You are now Tier 2", "success");
            
            // Optional: Update UI
            const statusEl = document.getElementById('zk-status');
            if (statusEl) statusEl.textContent = "Verified";
        }, 1500);

    } catch (error) {
        console.error("ZK Verification failed:", error);
        showToast("❌ ZK Verification failed", "error");
    }
}

/**
 * Start Phone Verification
 */
export async function startPhoneVerification() {
    try {
        if (!auth.currentUser) {
            showToast("Please log in first", "error");
            return;
        }

        showToast("📱 Starting Phone Verification...");
        
        // TODO: Add real phone verification (e.g. Firebase Phone Auth)
        setTimeout(() => {
            isPhoneVerified = true;
            showToast("✅ Phone Verified! You are now Tier 1", "success");
        }, 1200);

    } catch (error) {
        console.error("Phone verification failed:", error);
        showToast("❌ Phone verification failed", "error");
    }
}

/**
 * Send Invitation to Another User
 */
export async function sendInvitation() {
    try {
        if (!auth.currentUser) {
            showToast("Please log in to send invites", "error");
            return;
        }

        const inviteCode = "VW-" + Math.random().toString(36).substring(2, 10).toUpperCase();
        
        await addDoc(collection(db, "invites"), {
            from: auth.currentUser.uid,
            code: inviteCode,
            createdAt: serverTimestamp(),
            used: false
        });

        showToast(`✅ Invitation sent! Code: ${inviteCode}`, "success");
        
    } catch (error) {
        console.error("Failed to send invite:", error);
        showToast("❌ Failed to send invitation", "error");
    }
}

/**
 * Check Incoming Invite
 */
export async function checkIncomingInvite() {
    try {
        if (!auth.currentUser) return;

        showToast("🔍 Checking for invites...");

        // TODO: Add real query logic
        setTimeout(() => {
            showToast("📬 No pending invites found (demo)", "info");
        }, 800);

    } catch (error) {
        console.error("Invite check failed:", error);
    }
}

/**
 * Populate Country Dropdown (for language or phone codes)
 */
export function populateCountryDropdown(selectorId) {
    const selector = document.getElementById(selectorId);
    if (!selector) return;

    const countries = [
        { code: "en", name: "🇬🇧 English" },
        { code: "fr", name: "🇫🇷 Français" },
        { code: "es", name: "🇪🇸 Español" },
        // Add more as needed
    ];

    selector.innerHTML = countries.map(c => 
        `<option value="${c.code}">${c.name}</option>`
    ).join('');
}
