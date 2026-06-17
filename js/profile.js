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

// Checkbox/Verification DOM Elements
const panelVerification = document.getElementById('verification-panel');
const chkPhone = document.getElementById('chk-phone');
const chkZk = document.getElementById('chk-zk');
const chkTestimonies = document.getElementById('chk-testimonies');
const phoneText = document.getElementById('phone-status-text');
const zkText = document.getElementById('zk-status-text');
const testimoniesText = document.getElementById('testimonies-status-text');
const btnUpgrade = document.getElementById('btn-upgrade-witness');
const btnVerifyZK = document.getElementById("btn-verify-zk");
const btnVerifyPhone = document.getElementById('btn-verify-phone');

let currentUserId = null;

// Initialize ZK button as an informational coming-soon notification
if (btnVerifyZK) {
  btnVerifyZK.textContent = "⚙️ Cryptographic Prover Coming Soon";
  btnVerifyZK.disabled = true;
  btnVerifyZK.style.background = "#27272a";
  btnVerifyZK.style.color = "var(--text-muted)";
  btnVerifyZK.style.cursor = "not-allowed";
  btnVerifyZK.style.border = "1px dashed #52525b";
}

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
      if (avatarEl) avatarEl.src = userData.photoURL || "https://placehold.co/150";
      if (displayNameEl) displayNameEl.textContent = userData.displayName || "Anonymous User";
      if (usernameEl) usernameEl.textContent = `@${userData.username || 'user'}`;
      if (roleBadgeEl) roleBadgeEl.textContent = (userData.role || 'citizen').toUpperCase();

      // Handle the Two Lungs Display Logic
      if (userData.role === "witness" || userData.role === "trusted_witness") {
        if (witnessSection) witnessSection.style.display = "block";
        if (witnessLockedNotice) witnessLockedNotice.style.display = "none";
        if (panelVerification) panelVerification.style.display = "none"; 
        if (trustCircleScoreEl) trustCircleScoreEl.textContent = userData.trustCircle || 0;
        if (roleBadgeEl) roleBadgeEl.className = "badge badge-witness";
      } else {
        if (witnessSection) witnessSection.style.display = "none";
        if (witnessLockedNotice) witnessLockedNotice.style.display = "block";
        if (panelVerification) panelVerification.style.display = "block"; 
        if (roleBadgeEl) roleBadgeEl.className = "badge badge-citizen";
        
        // Evaluate Checklist Status for Citizens
        evaluateChecklist(userData);
      }
    }
  });
}

// Function to calculate if a Citizen is ready to upgrade
function evaluateChecklist(data) {
  let phoneReady = data.isPhoneVerified === true;
  let testimoniesReady = (data.testimoniesCount || 0) >= 3;

  // Update Phone Item
  if (chkPhone) chkPhone.textContent = phoneReady ? "✅" : "❌";
  if (phoneText) phoneText.textContent = phoneReady ? `Verified (${data.phoneNumber || 'Stored'})` : "Not Verified";
  if (btnVerifyPhone) {
    btnVerifyPhone.style.display = phoneReady ? 'none' : 'inline-block';
  }

  // ZK Item remains automatically marked with an informational status symbol for now
  if (chkZk) chkZk.textContent = "⏳";
  if (zkText) zkText.textContent = "Bypassed for Beta (Module Coming Soon)";

  // Update Testimonies Item
  if (chkTestimonies) chkTestimonies.textContent = testimoniesReady ? "✅" : "❌";
  if (testimoniesText) testimoniesText.textContent = `${data.testimoniesCount || 0} / 3 Testimonies posted`;

  // Focus primarily on Phone Verification and Active Participation to unlock Ascension
  if (btnUpgrade) {
    if (phoneReady && testimoniesReady) {
      btnUpgrade.disabled = false;
      btnUpgrade.style.background = "#10b981"; 
      btnUpgrade.style.color = "black";
      btnUpgrade.style.cursor = "pointer";
    } else {
      btnUpgrade.disabled = true;
      btnUpgrade.style.background = "#3f3f3f";
      btnUpgrade.style.color = "#a1a1aa";
      btnUpgrade.style.cursor = "not-allowed";
    }
  }
}

// Event Listener for the Ascension Action
if (btnUpgrade) {
  btnUpgrade.addEventListener('click', async () => {
    if (!currentUserId) return;
    
    const userRef = doc(db, "users", currentUserId);
    
    try {
      await updateDoc(userRef, {
        role: "witness",
        trustCircle: 25, 
        level: 2,
        badges: ["verified_witness"]
      });
      alert("Congratulations! You have ascended to Witness status. Your Trust Circle is now active.");
    } catch (error) {
      console.error("Error upgrading user status:", error);
    }
  });
}

// Real Action: Connect your active Phone verification hook here
if (btnVerifyPhone) {
  btnVerifyPhone.addEventListener('click', async () => {
    if (!currentUserId) return;
    
    // Simulating a phone verification write for your prototype environment:
    try {
      const userRef = doc(db, "users", currentUserId);
      await updateDoc(userRef, {
        isPhoneVerified: true,
        phoneNumber: "+1 (555) 019-2831"
      });
      alert("Phone verified successfully!");
    } catch (error) {
      console.error("Error updating phone status:", error);
    }
  });
}
