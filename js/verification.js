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

// ... [Keep your existing functions: checkInitialVerificationStatus, startZKVerification, startPhoneVerification, sendInvitation, populateCountryDropdown, checkIncomingInvite] ...

// DELETE THESE LINES:
// window.sendInvitation = sendInvitation;
// window.checkIncomingInvite = checkIncomingInvite;
// window.startZKVerification = startZKVerification;
// window.startPhoneVerification = startPhoneVerification;
