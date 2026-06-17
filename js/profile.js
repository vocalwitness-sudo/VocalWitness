import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-auth.js";
import { getFirestore, doc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/10.0.0/firebase-firestore.js";

const auth = getAuth();
const db = getFirestore();

// Existing DOM Elements
const avatarEl = document.getElementById('user-avatar');
const displayNameEl = document.getElementById('user-display-name');
const usernameEl = document.getElementById('user-username');
const roleBadgeEl = document.getElementById('user-role-badge');
const witnessSection = document.getElementById('witness-features-section');
const witnessLockedNotice = document.getElementById('witness-locked-notice');
const trustCircleScoreEl = document.getElementById('trust-circle-score');

// NEW Checkbox/Verification DOM Elements
const panelVerification = document.getElementById('verification-panel');
const chkPhone = document.getElementById('chk-phone');
const chkZk = document.getElementById('chk-zk');
const chkTestimonies = document.getElementById('chk-testimonies');
const phoneText = document.getElementById('phone-status-text');
const zkText = document.getElementById('zk-status-text');
const testimoniesText = document.getElementById('testimonies-status-text');
const btnUpgrade = document.getElementById('btn-upgrade-witness');

let currentUserId = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserId = user.uid;
    listenToUserProfile(user.uid);
  } else {
    console.log("No user signed in.");
  }
});

function listenToUserProfile(userId) {
  const userRef = doc(db, "users", userId);

  onSnapshot(userRef, (snapshot) => {
    if (snapshot.exists()) {
      const userData = snapshot.data();
      
      // Populate basic info
      avatarEl.src = userData.photoURL || "https://placehold.co/150";
      displayNameEl.textContent = userData.displayName;
      usernameEl.textContent = `@${userData.username}`;
      roleBadgeEl.textContent = userData.role.toUpperCase();

      // Handle the Two Lungs Display Logic
      if (userData.role === "witness" || userData.role === "trusted_witness") {
        witnessSection.style.display = "block";
        witnessLockedNotice.style.display = "none";
        panelVerification.style.display = "none"; // Hide checklist if already a Witness
        trustCircleScoreEl.textContent = userData.trustCircle;
        roleBadgeEl.className = "badge badge-witness";
      } else {
        witnessSection.style.display = "none";
        witnessLockedNotice.style.display = "block";
        panelVerification.style.display = "block"; // Show checklist to Citizens
        roleBadgeEl.className = "badge badge-citizen";
        
        // Evaluate Checklist Status for Citizens
        evaluateChecklist(userData);
      }
    }
  });
}

// Function to calculate if a Citizen is ready to upgrade
function evaluateChecklist(data) {
  let phoneReady = data.isPhoneVerified === true;
  let zkReady = data.zkVerified === true;
  let testimoniesReady = data.testimoniesCount >= 3;

  // Update UI Checkmarks & Subtext
  chkPhone.textContent = phoneReady ? "✅" : "❌";
  phoneText.textContent = phoneReady ? `Verified (${data.phoneNumber})` : "Not Verified";
  if (phoneReady) document.getElementById('btn-verify-phone').style.display = 'none';

  chkZk.textContent = zkReady ? "✅" : "❌";
  zkText.textContent = zkReady ? "Verified Cryptographically" : "Pending";
  if (zkReady) document.getElementById('btn-verify-zk').style.display = 'none';

  chkTestimonies.textContent = testimoniesReady ? "✅" : "❌";
  testimoniesText.textContent = `${data.testimoniesCount} / 3 Testimonies posted`;

  // If all conditions are met, unlock the Ascend button
  if (phoneReady && zkReady && testimoniesReady) {
    btnUpgrade.disabled = false;
    btnUpgrade.style.background = "#10b981"; // Change button to Witness Green
    btnUpgrade.style.color = "black";
    btnUpgrade.style.cursor = "pointer";
  } else {
    btnUpgrade.disabled = true;
  }
}

// Event Listener for the Ascension Action
btnUpgrade.addEventListener('click', async () => {
  if (!currentUserId) return;
  
  const userRef = doc(db, "users", currentUserId);
  
  try {
    // In production, your Cloud Function handles this securely.
    // For local frontend testing, we update Firestore directly:
    await updateDoc(userRef, {
      role: "witness",
      trustCircle: 25, // Trust Circle initializes at 25% strength on ascension
      level: 2,
      badges: ["verified_witness"]
    });
    alert("Congratulations! You have ascended to Witness status. Your Trust Circle is now active.");
  } catch (error) {
    console.error("Error upgrading user status:", error);
  }
});

// Mocking verification steps for testing
document.getElementById('btn-verify-phone').addEventListener('click', () => {
  alert("Redirecting to phone-auth.js flow...");
  // In your real flow, you link this to your phone-auth.js system!
});

document.getElementById('btn-verify-zk').addEventListener('click', async () => {
  if (!currentUserId) return;
  // Simulating ZK proof generation success for now
  await updateDoc(doc(db, "users", currentUserId), { zkVerified: true });
});
