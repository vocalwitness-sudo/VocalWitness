import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js"; // Adjust version if needed
import { getFirestore, doc, onSnapshot } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

// DOM Elements
const avatarEl = document.getElementById('user-avatar');
const displayNameEl = document.getElementById('user-display-name');
const usernameEl = document.getElementById('user-username');
const roleBadgeEl = document.getElementById('user-role-badge');

const witnessSection = document.getElementById('witness-features-section');
const witnessLockedNotice = document.getElementById('witness-locked-notice');
const trustCircleScoreEl = document.getElementById('trust-circle-score');

// Listen for Auth State Changes
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is logged in, now listen to their live profile data in Firestore
    listenToUserProfile(user.uid);
  } else {
    // No user is signed in, redirect to login page or handle accordingly
    console.log("No user signed in.");
  }
});

// Real-time listener for the user's document
function listenToUserProfile(userId) {
  const userRef = doc(db, "users", userId);

  // onSnapshot updates the UI automatically if their role changes live!
  onSnapshot(userRef, (snapshot) => {
    if (snapshot.exists()) {
      const userData = snapshot.data();
      
      // 1. Populate Basic Profile (Citizen Info)
      avatarEl.src = userData.photoURL || "https://placehold.co/150";
      displayNameEl.textContent = userData.displayName;
      usernameEl.textContent = `@${userData.username}`;
      roleBadgeEl.textContent = userData.role.toUpperCase();

      // 2. Conditional UI Check (The Two Lungs Logic)
      if (userData.role === "witness" || userData.role === "trusted_witness") {
        // Unlock Lung 2: Witness Mode
        witnessSection.style.display = "block";
        witnessLockedNotice.style.display = "none";
        
        // Update Witness specific stats
        trustCircleScoreEl.textContent = userData.trustCircle;
        roleBadgeEl.className = "badge-witness"; // You can style this gold/silver in CSS
      } else {
        // Keep Lung 2 Locked, keep them in Lung 1: Casual Citizen Talk
        witnessSection.style.display = "none";
        witnessLockedNotice.style.display = "block";
        roleBadgeEl.className = "badge-citizen"; // Style this bronze/neutral
      }

    } else {
      console.error("No such user document found in Firestore.");
    }
  });
}
