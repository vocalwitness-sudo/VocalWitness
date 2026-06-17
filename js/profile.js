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
const btnVerifyZK = document.getElementById("btn-verify-zk");

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
  if (zkReady) btnVerifyZK.style.display = 'none';

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
    btnUpgrade.style.background = "#3f3f3f";
    btnUpgrade.style.color = "#a1a1aa";
    btnUpgrade.style.cursor = "not-allowed";
  }
}

// Event Listener for the Ascension Action
btnUpgrade.addEventListener('click', async () => {
  if (!currentUserId) return;
  
  const userRef = doc(db, "users", currentUserId);
  
  try {
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

// Mocking phone verification step for testing
document.getElementById('btn-verify-phone').addEventListener('click', () => {
  alert("Redirecting to phone authentication flow...");
});

// REAL-TIME WORKER INTEGRATION FOR ZERO-KNOWLEDGE PROOF
if (btnVerifyZK) {
  btnVerifyZK.addEventListener("click", () => {
    if (!currentUserId) {
      alert("Please wait until authentication finishes initializing.");
      return;
    }

    // 1. Change button UI to show it is computing in the background
    btnVerifyZK.textContent = "Computing ZK Proof... ⚡";
    btnVerifyZK.disabled = true;
    btnVerifyZK.style.cursor = "not-allowed";

    // 2. Spin up your Web Worker file
    const zkWorker = new Worker('js/zk-worker.js');

    // 3. Send data to the worker to kick off the simulation
    zkWorker.postMessage({
      identityCommitment: `0x_witness_${currentUserId.substring(0, 5)}_hash`,
      witnessData: { testimonies: 3 }
    });

    // 4. Listen for the worker to finish up
    zkWorker.onmessage = async (event) => {
      const { success, proof, error } = event.data;

      if (success) {
        console.log("Success! Generated proof:", proof);

        try {
          // 🔥 Write the successful verification back to Firestore
          const userRef = doc(db, "users", currentUserId);
          await updateDoc(userRef, { 
            zkVerified: true,
            verifiedAt: new Date()
          });

          // Update UI styles immediately
          document.getElementById("chk-zk").textContent = "✅";
          zkText.textContent = "Verified Cryptographically";
          zkText.style.color = "var(--witness-green)";
          btnVerifyZK.textContent = "Proof Securely Saved";
          
        } catch (dbError) {
          console.error("Error updating Firestore ZK state:", dbError);
          btnVerifyZK.textContent = "Sync Error. Retry";
          btnVerifyZK.disabled = false;
          btnVerifyZK.style.cursor = "pointer";
        }
      } else {
        console.error("ZK Error:", error);
        btnVerifyZK.textContent = "Proof Failed. Retry";
        btnVerifyZK.disabled = false;
        btnVerifyZK.style.cursor = "pointer";
      }

      // 5. Turn off the worker to save device memory
      zkWorker.terminate();
    };
  });
}
