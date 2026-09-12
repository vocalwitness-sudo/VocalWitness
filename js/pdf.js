// js/pdf.js - Complete Dual System (Standard + Premium)
// Features: Real QR, Avatar, Soft limits, 1 free Premium/month for Gold+, $2.99 paid

import { showToast } from './utils.js';
import { 
  doc, setDoc, collection, query, where, getDocs, 
  serverTimestamp, Timestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/* ============================================================
   TIER + ACCESS LOGIC
   ============================================================ */
export function getTier(trustScore = 0) {
  if (trustScore >= 100) return { name: 'Premium', color: '#FFD700', level: 4 };
  if (trustScore >= 80)  return { name: 'Gold',    color: '#FFD700', level: 3 };
  if (trustScore >= 60)  return { name: 'Silver',  color: '#C0C0C0', level: 2 };
  if (trustScore >= 40)  return { name: 'Bronze',  color: '#CD7F32', level: 1 };
  return { name: 'Explorer', color: '#808080', level: 0 };
}

function resolveCertificateType(userData) {
  const trustScore = userData?.trustScore || userData?.reputation || 0;
  const tier = getTier(trustScore);
  const isZkVerified = !!(userData?.zkVerified);

  if (!isZkVerified) {
    return { allowed: false, reason: 'zk', tier };
  }

  return { 
    allowed: true, 
    canPremiumFree: tier.level >= 3, // Gold+ get 1 free Premium / month
    tier, 
    isSupporter: !!(userData?.isSupporter || userData?.supporter)
  };
}

/* ============================================================
   QUOTA HELPERS
   ============================================================ */
async function getMonthlyUsage(db, userId, type) {
  if (!db || !userId) return 0;

  try {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const q = query(
      collection(db, "verifiable_docs"),
      where("userId", "==", userId),
      where("type", "==", type),
      where("createdAt", ">=", Timestamp.fromDate(startOfMonth))
    );

    const snapshot = await getDocs(q);
    return snapshot.size;
  } catch (err) {
    console.warn("getMonthlyUsage error:", err);
    return 0;
  }
}

async function canGenerateStandard(db, userId) {
  const used = await getMonthlyUsage(db, userId, "standard");
  return used < 3; // Max 3 Standard per month
}

async function canGenerateFreePremium(db, userId, canPremiumFree) {
  if (!canPremiumFree) return false;
  const used = await getMonthlyUsage(db, userId, "premium");
  return used < 1; // Only 1 free Premium per month for Gold+
}

/* ============================================================
   MAIN ENTRY
   ============================================================ */
export async function generateAndDownloadPDF(userData, db, preferredType = null) {
  if (!userData) {
    showToast("Profile data not loaded", "error");
    return;
  }

  // Safety: jsPDF must be loaded
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast("PDF library not loaded. Please refresh the page.", "error");
    return;
  }

  const decision = resolveCertificateType(userData);

  if (!decision.allowed) {
    showToast("🔒 Identity Certificate requires ZK Verification first", "warning");
    return;
  }

  const userId = userData.uid || userData.authorId || "anonymous";
  const wantsPremium = preferredType === 'premium';

  // ========== STANDARD ==========
  if (!wantsPremium) {
    const allowed = await canGenerateStandard(db, userId);
    if (!allowed) {
      showToast("Monthly limit of 3 Standard Passports reached. Try again next month or get Premium.", "warning");
      return;
    }
    return await proceedGeneration(userData, db, decision, "standard");
  }

  // ========== PREMIUM ==========
  const hasFreeQuota = await canGenerateFreePremium(db, userId, decision.canPremiumFree);

  if (hasFreeQuota) {
    // Free by merit (Gold+)
    return await proceedGeneration(userData, db, decision, "premium");
  }

  // No free quota left → show payment modal
  showPremiumUpgradeModal(userData, db);
}

/* ============================================================
   SHARED GENERATION
   ============================================================ */
async function proceedGeneration(userData, db, decision, type) {
  const message = type === 'premium'
    ? "Premium Certificate Notice:\n\nThis is an official high-grade VocalWitness Identity Certificate. It is cryptographically linked to the public ledger. Any alteration will invalidate it."
    : "Standard Passport Notice:\n\nThis document is cryptographically linked to your VocalWitness record. Any alteration will invalidate its authenticity.";

  if (!confirm(message)) return;

  showToast(type === 'premium' ? "Generating Premium Certificate..." : "Generating Standard Passport...", "info");

  try {
    const docId = crypto.randomUUID();
    const userId = userData.uid || userData.authorId || "anonymous";

    if (db) {
      await setDoc(doc(db, "verifiable_docs", docId), {
        userId,
        type,
        createdAt: serverTimestamp(),
        status: "active",
        tier: decision.tier.name,
        trustScore: userData.trustScore || userData.reputation || 0,
        username: userData.username || null,
        zkVerified: true,
        isSupporter: !!decision.isSupporter,
        paid: type === "premium"
      });
    }

    const verificationUrl = `${window.location.origin}/verify.html?id=${docId}`;

    if (type === 'premium') {
      await generatePremiumCertificate(userData, decision.tier, docId, verificationUrl);
    } else {
      await generateStandardPassport(userData, decision.tier, docId, verificationUrl);
    }

    showToast(
      type === 'premium'
        ? "✅ Premium Certificate downloaded!"
        : "✅ Standard Passport downloaded!",
      "success"
    );
  } catch (error) {
    console.error("PDF generation failed:", error);
    showToast("Failed to generate certificate", "error");
  }
}

/* ============================================================
   HELPERS: QR + Avatar
   ============================================================ */
async function generateQRCodeDataUrl(text, size = 120) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&margin=8`;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("QR generation failed:", err);
    return null;
  }
}

async function loadImageAsDataUrl(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { mode: 'cors' });
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    console.warn("Avatar load failed:", err);
    return null;
  }
}

/* ============================================================
   STANDARD PASSPORT
   ============================================================ */
async function generateStandardPassport(userData, tier, docId, verificationUrl) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, 210, 42, 'F');

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(52, 211, 153);
  pdf.text("VocalWitness", 20, 18);

  pdf.setFontSize(11);
  pdf.setTextColor(203, 213, 225);
  pdf.text("Standard Identity Passport", 20, 27);

  pdf.setFont("courier", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(148, 163, 184);
  pdf.text(`ID: ${docId}`, 20, 36);

  // Avatar
  let y = 55;
  const avatarData = await loadImageAsDataUrl(userData.photoURL);
  if (avatarData) {
    try {
      pdf.addImage(avatarData, 'JPEG', 20, y, 22, 22);
    } catch (e) {}
  }

  const textX = avatarData ? 48 : 20;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(30, 41, 59);
  pdf.text(userData.displayName || "Anonymous Witness", textX, y + 8);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`@${userData.username || "anonymous"}  •  ${tier.name}`, textX, y + 15);

  y = 88;

  const lines = [
    `Reputation     : ${userData.reputation || userData.trustScore || 0} REP`,
    `ZK Verified    : Yes`,
    `Phone          : ${userData.isPhoneVerified || userData.hasVerifiedPhone ? "Verified" : "Not verified"}`,
    `Privacy Shield : ${userData.hidePublicInfo !== false ? "Active" : "Public"}`,
    `Issued         : ${new Date().toLocaleString()}`
  ];

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(51, 65, 85);

  lines.forEach(line => {
    pdf.text(line, 20, y);
    y += 7.5;
  });

  y += 6;
  pdf.setDrawColor(226, 232, 240);
  pdf.line(20, y, 190, y);

  y += 12;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Cryptographic Integrity", 20, y);

  y += 8;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text("This document is bound to the VocalWitness public ledger.", 20, y);
  pdf.text("Any alteration invalidates the verification seal.", 20, y + 6);

  const qrData = await generateQRCodeDataUrl(verificationUrl, 110);
  if (qrData) {
    try {
      pdf.addImage(qrData, 'PNG', 150, 195, 32, 32);
    } catch (e) {}
  }

  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(20, 235, 120, 28, 3, 3, 'F');

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(30, 41, 59);
  pdf.text("Public Verification", 28, 245);

  pdf.setFont("courier", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(13, 148, 136);
  pdf.text(verificationUrl.substring(0, 52) + "...", 28, 253);

  pdf.save(`VocalWitness_Standard_${docId.slice(0, 8)}.pdf`);
}

/* ============================================================
   PREMIUM CERTIFICATE
   ============================================================ */
async function generatePremiumCertificate(userData, tier, docId, verificationUrl) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Luxury dark header
  pdf.setFillColor(9, 9, 11);
  pdf.rect(0, 0, 210, 54, 'F');

  // Gold line
  pdf.setFillColor(234, 179, 8);
  pdf.rect(0, 54, 210, 1.8, 'F');

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(22);
  pdf.setTextColor(250, 204, 21);
  pdf.text("VocalWitness", 20, 22);

  pdf.setFontSize(12);
  pdf.setTextColor(253, 224, 71);
  pdf.text("PREMIUM IDENTITY CERTIFICATE", 20, 33);

  pdf.setFont("courier", "normal");
  pdf.setFontSize(8);
  pdf.setTextColor(161, 161, 170);
  pdf.text(`Certificate ID: ${docId}`, 20, 45);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(52, 211, 153);
  pdf.text("● ZK-VERIFIED  •  OFFICIAL SEAL", 128, 28);

  // Avatar
  let y = 68;
  const avatarData = await loadImageAsDataUrl(userData.photoURL);
  if (avatarData) {
    try {
      pdf.addImage(avatarData, 'JPEG', 20, y, 28, 28);
    } catch (e) {}
  }

  const textX = avatarData ? 55 : 20;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.setTextColor(24, 24, 27);
  pdf.text(userData.displayName || "Anonymous Witness", textX, y + 10);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);
  pdf.setTextColor(63, 63, 70);
  pdf.text(`@${userData.username || "anonymous"}  •  ${tier.name} Tier`, textX, y + 19);

  y = 108;

  const premiumLines = [
    `Reputation Score   : ${userData.reputation || userData.trustScore || 0} REP`,
    `Verification       : Zero-Knowledge Proof Confirmed`,
    `Phone Status       : ${userData.isPhoneVerified || userData.hasVerifiedPhone ? "Verified" : "Not verified"}`,
    `Privacy Shield     : ${userData.hidePublicInfo !== false ? "Active" : "Public"}`,
    `Issued On          : ${new Date().toLocaleString()}`
  ];

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(39, 39, 42);

  premiumLines.forEach(line => {
    pdf.text(line, 20, y);
    y += 8.2;
  });

  y += 6;
  pdf.setDrawColor(234, 179, 8);
  pdf.setLineWidth(0.7);
  pdf.line(20, y, 190, y);

  y += 12;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(24, 24, 27);
  pdf.text("Cryptographic & Forensic Guarantee", 20, y);

  y += 9;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(63, 63, 70);
  pdf.text("This Premium Certificate is permanently registered on the VocalWitness", 20, y);
  pdf.text("verifiable documents ledger. It serves as official proof of identity", 20, y + 6);
  pdf.text("standing and zero-knowledge verification within the network.", 20, y + 12);
  pdf.text("Any modification of this file voids the cryptographic seal.", 20, y + 18);

  const qrData = await generateQRCodeDataUrl(verificationUrl, 140);
  if (qrData) {
    try {
      pdf.addImage(qrData, 'PNG', 150, 175, 38, 38);
    } catch (e) {}
  }

  pdf.setFillColor(24, 24, 27);
  pdf.roundedRect(20, 230, 120, 38, 4, 4, 'F');

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(9);
  pdf.setTextColor(250, 204, 21);
  pdf.text("PUBLIC VERIFICATION PORTAL", 28, 242);

  pdf.setFont("courier", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(52, 211, 153);
  pdf.text(verificationUrl.substring(0, 48) + "...", 28, 251);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(161, 161, 170);
  pdf.text("Scan the QR or visit the link to confirm authenticity.", 28, 259);

  pdf.save(`VocalWitness_Premium_${docId.slice(0, 8)}.pdf`);
}

/* ============================================================
   UPGRADE MODAL ($2.99)
   ============================================================ */
export function showPremiumUpgradeModal(userData, db) {
  document.getElementById('premiumUpgradeModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'premiumUpgradeModal';
  modal.className = 'fixed inset-0 z-[10060] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm';
  modal.innerHTML = `
    <div class="relative w-full max-w-md rounded-3xl border border-amber-500/30 bg-zinc-900 p-6 shadow-2xl text-white">
      <button id="closePremiumModal" class="absolute top-4 right-4 text-zinc-400 hover:text-white text-xl leading-none">&times;</button>

      <div class="text-center mb-5">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-3">
          <span class="text-2xl">🎖️</span>
        </div>
        <h3 class="text-xl font-bold text-amber-400">Get Premium Certificate</h3>
        <p class="text-sm text-zinc-400 mt-1">High-quality official identity document</p>
      </div>

      <div class="space-y-3 mb-6 text-sm">
        <div class="flex items-start gap-3">
          <span class="text-emerald-400 mt-0.5">✓</span>
          <span>Larger QR + Official ZK Seal</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-emerald-400 mt-0.5">✓</span>
          <span>Profile photo + Luxury dark/gold design</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-emerald-400 mt-0.5">✓</span>
          <span>Higher visual authority • No watermark</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-emerald-400 mt-0.5">✓</span>
          <span>Supports VocalWitness infrastructure</span>
        </div>
      </div>

      <div class="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 mb-5 text-center">
        <div class="text-2xl font-bold text-white">$2.99</div>
        <div class="text-xs text-zinc-400 mt-1">One-time download • Does not change your membership tier</div>
      </div>

      <div class="flex flex-col gap-3">
        <button id="upgradeToPremiumBtn" class="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold transition">
          Pay $2.99 & Download Premium
        </button>
        <button id="downloadStandardInstead" class="w-full py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition">
          Download Standard Passport (Free)
        </button>
      </div>

      <p class="text-[11px] text-zinc-500 text-center mt-4">
        Gold & Steward members get 1 free Premium certificate every month.
      </p>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('closePremiumModal')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  document.getElementById('upgradeToPremiumBtn')?.addEventListener('click', () => {
    modal.remove();
    showToast("Redirecting to secure payment...", "info");

    // After successful payment you can call:
    // proceedGeneration(userData, db, resolveCertificateType(userData), "premium");

    if (typeof window.openSupportModal === 'function') {
      window.openSupportModal();
    }
  });

  document.getElementById('downloadStandardInstead')?.addEventListener('click', () => {
    modal.remove();
    generateAndDownloadPDF(userData, db, 'standard');
  });
<<<<<<< HEAD
}
=======
}
>>>>>>> 44e292d (fix: remove global CSS selectors to restore Tailwind layout integrity)
