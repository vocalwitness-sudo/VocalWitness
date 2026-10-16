// js/pdf.js - Complete Dual System (Standard + Premium)
// Features: Real QR, Monogram Avatar Fallbacks, Soft limits, 1 free Premium/month for Gold+, $2.99 Stripe checkout
// Validity: 1-year display window + lifetime ledger record
import { showToast } from './utils.js';
import { t } from './i18n.js';
import { 
  doc, setDoc, collection, query, where, getDocs, 
  serverTimestamp, Timestamp 
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/* ============================================================
   CONSTANTS
   ============================================================ */
const DISPLAY_VALIDITY_DAYS = 365; // change to 730 for 2-year display window

/* ============================================================
   TIER + ACCESS LOGIC
   ============================================================ */
export function getTier(trustScore = 0) {
  if (trustScore >= 100) return { name: t('tier.premium', 'Premium'), color: '#FFD700', level: 4 };
  if (trustScore >= 80)  return { name: t('tier.gold', 'Gold'), color: '#FFD700', level: 3 };
  if (trustScore >= 60)  return { name: t('tier.silver', 'Silver'), color: '#C0C0C0', level: 2 };
  if (trustScore >= 40)  return { name: t('tier.bronze', 'Bronze'), color: '#CD7F32', level: 1 };
  return { name: t('tier.explorer', 'Explorer'), color: '#808080', level: 0 };
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
    canPremiumFree: tier.level >= 3,
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
  return used < 3;
}

async function canGenerateFreePremium(db, userId, canPremiumFree) {
  if (!canPremiumFree) return false;
  const used = await getMonthlyUsage(db, userId, "premium");
  return used < 1;
}

/* ============================================================
   MAIN ENTRY
   ============================================================ */
export async function generateAndDownloadPDF(userData, db, preferredType = null) {
  if (!userData) {
    showToast(t('pdf.toastProfileNotLoaded', "Profile data not loaded"), "error");
    return;
  }
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast(t('pdf.toastLibNotLoaded', "PDF library not loaded. Please refresh the page."), "error");
    return;
  }

  const decision = resolveCertificateType(userData);
  if (!decision.allowed) {
    showToast(t('pdf.toastZkRequired', "🔒 Independent Citizen Press Credential requires ZK Verification first"), "warning");
    return;
  }

  const userId = userData.uid || userData.authorId || "anonymous";
  const wantsPremium = preferredType === 'premium';

  if (!wantsPremium) {
    const allowed = await canGenerateStandard(db, userId);
    if (!allowed) {
      showToast(t('pdf.toastStandardLimit', "Monthly limit of 3 Standard Credentials reached. Try again next month or upgrade to Official."), "warning");
      return;
    }
    return await proceedGeneration(userData, db, decision, "standard");
  }

  const hasFreeQuota = await canGenerateFreePremium(db, userId, decision.canPremiumFree);
  if (hasFreeQuota) {
    return await proceedGeneration(userData, db, decision, "premium");
  }

  showPremiumUpgradeModal(userData, db);
}

/* ============================================================
   SHARED GENERATION
   ============================================================ */
async function proceedGeneration(userData, db, decision, type) {
  const message = type === 'premium'
    ? t('pdf.confirmPremiumMsg', "Official Credential Notice:\n\nThis is an Official Independent Citizen Press Credential. It is cryptographically linked to the public ledger (lifetime record) and reflects verified on-the-ground participation. Any alteration will invalidate it.\n\nDisplay validity is a recommended presentation window; the ledger record does not expire.")
    : t('pdf.confirmStandardMsg', "Standard Credential Notice:\n\nThis Independent Citizen Press Credential is cryptographically linked to your VocalWitness record (lifetime ledger). Any alteration will invalidate its authenticity.");

  if (!confirm(message)) return;

  showToast(type === 'premium' 
    ? t('pdf.toastGeneratingOfficial', "Generating Official Independent Citizen Press Credential...") 
    : t('pdf.toastGeneratingStandard', "Generating Standard Independent Citizen Press Credential..."), "info");

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
        paid: type === "premium",
        displayValidDays: type === "premium" ? DISPLAY_VALIDITY_DAYS : null,
        ledgerPermanent: true
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
        ? t('pdf.toastSuccessOfficial', "✅ Official Independent Citizen Press Credential downloaded!")
        : t('pdf.toastSuccessStandard', "✅ Standard Independent Citizen Press Credential downloaded!"),
      "success"
    );
  } catch (error) {
    console.error("PDF generation failed:", error);
    showToast(t('pdf.toastFailed', "Failed to generate credential"), "error");
  }
}

/* ============================================================
   HELPERS: QR + Avatar with Fallbacks
   ============================================================ */
async function generateQRCodeDataUrl(text, size = 120) {
  const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}&margin=8`;
  try {
    const response = await fetch(url, { mode: 'cors' });
    if (!response.ok) throw new Error('QR API network response failed');
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
    if (!response.ok) throw new Error('Avatar fetch failed');
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

function drawMonogramFallback(pdf, name, x, y, size = 22, isGold = false) {
  const initials = (name || t('common.anonymous', "Anonymous"))
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  pdf.setFillColor(isGold ? 234 : 51, isGold ? 179 : 65, isGold ? 8 : 85);
  pdf.circle(x + size / 2, y + size / 2, size / 2, 'F');
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(size * 0.45);
  pdf.setTextColor(255, 255, 255);
  pdf.text(initials, x + size / 2, y + size / 2 + 1.5, { align: 'center' });
}

/* ============================================================
   STANDARD CREDENTIAL (Free)
   ============================================================ */
async function generateStandardPassport(userData, tier, docId, verificationUrl) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Header
  pdf.setFillColor(15, 23, 42);
  pdf.rect(0, 0, 210, 42, 'F');

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(18);
  pdf.setTextColor(52, 211, 153);
  pdf.text(t('appTitle', "VocalWitness"), 20, 16);

  pdf.setFontSize(12);
  pdf.setTextColor(226, 232, 240);
  pdf.text(t('pdf.titleCredential', "Independent Citizen Press Credential"), 20, 25);

  pdf.setFontSize(9);
  pdf.setTextColor(148, 163, 184);
  pdf.text(t('pdf.standardSubtitle', "Standard  •  Proof of Verified Participation"), 20, 33);

  pdf.setFont("courier", "normal");
  pdf.setFontSize(7.5);
  pdf.text(`ID: ${docId}`, 20, 39);

  // Avatar / Monogram
  let y = 55;
  const avatarData = await loadImageAsDataUrl(userData.photoURL);
  if (avatarData) {
    try {
      pdf.addImage(avatarData, 'JPEG', 20, y, 22, 22);
    } catch (e) {
      drawMonogramFallback(pdf, userData.displayName, 20, y, 22, false);
    }
  } else {
    drawMonogramFallback(pdf, userData.displayName, 20, y, 22, false);
  }

  const textX = 48;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(13);
  pdf.setTextColor(30, 41, 59);
  pdf.text(userData.displayName || t('pdf.anonymousContributor', "Anonymous Contributor"), textX, y + 8);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.setTextColor(71, 85, 105);
  pdf.text(`@${userData.username || "anonymous"}  •  ${tier.name}`, textX, y + 15);

  y = 88;
  const lines = [
    `${t('pdf.reputationLabel', "Reputation")}          : ${userData.reputation || userData.trustScore || 0} REP`,
    `${t('pdf.zkLabel', "ZK Verification")}     : ${t('pdf.statusConfirmed', "Confirmed")}`,
    `${t('pdf.phoneLabel', "Phone Status")}        : ${userData.isPhoneVerified || userData.hasVerifiedPhone ? t('common.verified', "Verified") : t('common.not_verified', "Not verified")}`,
    `${t('pdf.privacyLabel', "Privacy Shield")}      : ${userData.hidePublicInfo !== false ? t('common.active', "Active") : t('common.public', "Public")}`,
    `${t('pdf.issuedLabel', "Issued")}              : ${new Date().toLocaleString()}`,
    `${t('pdf.ledgerRecordLabel', "Ledger record")}       : ${t('pdf.permanentLifetime', "Permanent (lifetime)")}`
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
  y += 11;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(15, 23, 42);
  pdf.text(t('pdf.aboutHeader', "About this Credential"), 20, y);
  y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.setTextColor(100, 116, 139);
  pdf.text(t('pdf.standardBodyLine1', "This Independent Citizen Press Credential certifies that the holder is an active,"), 20, y);
  pdf.text(t('pdf.standardBodyLine2', "zero-knowledge verified contributor on the VocalWitness network. It serves as"), 20, y + 5.5);
  pdf.text(t('pdf.standardBodyLine3', "proof of participation in ground-level citizen journalism and public-interest reporting."), 20, y + 11);
  pdf.text(t('pdf.standardBodyLine4', "The public ledger record is permanent. This is the free Standard version."), 20, y + 16.5);

  // Light watermark
  pdf.setTextColor(235, 235, 235);
  pdf.setFontSize(42);
  pdf.text("STANDARD", 58, 165, { angle: 28 });

  const qrData = await generateQRCodeDataUrl(verificationUrl, 110);
  if (qrData) {
    try {
      pdf.addImage(qrData, 'PNG', 150, 195, 32, 32);
    } catch (e) {}
  }

  // Verification box (Standard – shorter)
  pdf.setFillColor(241, 245, 249);
  pdf.roundedRect(20, 235, 120, 28, 3, 3, 'F');
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8);
  pdf.setTextColor(30, 41, 59);
  pdf.text(t('pdf.publicVerificationBox', "Public Verification"), 28, 245);
  pdf.setFont("courier", "normal");
  pdf.setFontSize(6.5);
  pdf.setTextColor(13, 148, 136);
  pdf.text(verificationUrl, 28, 253);

  pdf.save(`Independent_Citizen_Press_Credential_Standard_${docId.slice(0, 8)}.pdf`);
}

/* ============================================================
   PREMIUM / OFFICIAL CREDENTIAL (Paid – extra value)
   ============================================================ */
async function generatePremiumCertificate(userData, tier, docId, verificationUrl) {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Dark header
  pdf.setFillColor(9, 9, 11);
  pdf.rect(0, 0, 210, 56, 'F');

  // Gold accent line
  pdf.setFillColor(234, 179, 8);
  pdf.rect(0, 56, 210, 2, 'F');

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.setTextColor(250, 204, 21);
  pdf.text(t('appTitle', "VocalWitness"), 20, 20);

  pdf.setFontSize(13);
  pdf.setTextColor(253, 224, 71);
  pdf.text(t('pdf.premiumTitle', "INDEPENDENT CITIZEN PRESS CREDENTIAL"), 20, 31);

  pdf.setFontSize(9);
  pdf.setTextColor(212, 212, 216);
  pdf.text(t('pdf.premiumSubtitle', "Official  •  Verified On-the-Ground Participation"), 20, 40);

  pdf.setFont("courier", "normal");
  pdf.setFontSize(7.5);
  pdf.setTextColor(161, 161, 170);
  pdf.text(`${t('pdf.credentialIdPrefix', "Credential ID")}: ${docId}`, 20, 49);

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(52, 211, 153);
  pdf.text(t('pdf.zkSealBanner', "● ZK-VERIFIED  •  OFFICIAL SEAL"), 135, 28);

  // Avatar with gold ring
  let y = 70;
  const avatarData = await loadImageAsDataUrl(userData.photoURL);
  if (avatarData) {
    try {
      pdf.setDrawColor(234, 179, 8);
      pdf.setLineWidth(1.6);
      pdf.circle(34, y + 14, 16);
      pdf.addImage(avatarData, 'JPEG', 20, y, 28, 28);
    } catch (e) {
      drawMonogramFallback(pdf, userData.displayName, 20, y, 28, true);
    }
  } else {
    drawMonogramFallback(pdf, userData.displayName, 20, y, 28, true);
  }

  const textX = 55;
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(15);
  pdf.setTextColor(24, 24, 27);
  pdf.text(userData.displayName || t('pdf.anonymousContributor', "Anonymous Contributor"), textX, y + 10);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(63, 63, 70);
  pdf.text(`@${userData.username || "anonymous"}  •  ${tier.name} Tier`, textX, y + 18);

  y = 110;

  const membershipSince = userData.createdAt?.toDate
    ? userData.createdAt.toDate().toLocaleDateString()
    : (userData.createdAt ? new Date(userData.createdAt).toLocaleDateString() : "—");

  const sealedCount = userData.sealedReportsCount || userData.totalTestimonies || 0;
  const highestLevel = userData.highestWitnessLevel || tier.name || "—";
  const displayUntil = new Date(Date.now() + DISPLAY_VALIDITY_DAYS * 24 * 60 * 60 * 1000)
    .toLocaleDateString();

  const premiumLines = [
    `${t('pdf.credTypeLabel', "Credential Type")}         : ${t('pdf.officialPaid', "Official (Paid)")}`,
    `${t('pdf.repScoreLabel', "Reputation Score")}        : ${userData.reputation || userData.trustScore || 0} REP`,
    `${t('pdf.verificationLabel', "Verification")}            : ${t('pdf.zkConfirmedText', "Zero-Knowledge Proof Confirmed")}`,
    `${t('pdf.phoneStatusLabel', "Phone Status")}            : ${userData.isPhoneVerified || userData.hasVerifiedPhone ? t('common.verified', "Verified") : t('common.not_verified', "Not verified")}`,
    `${t('pdf.privacyShieldLabel', "Privacy Shield")}          : ${userData.hidePublicInfo !== false ? t('common.active', "Active") : t('common.public', "Public")}`,
    `${t('pdf.activeSinceLabel', "Active Since")}            : ${membershipSince}`,
    `${t('pdf.sealedReportsLabel', "Sealed Reports")}          : ${sealedCount}`,
    `${t('pdf.highestLevelLabel', "Highest Level")}           : ${highestLevel}`,
    `${t('pdf.issuedOnLabel', "Issued On")}               : ${new Date().toLocaleString()}`,
    `${t('pdf.displayValidLabel', "Display valid until")}     : ${displayUntil}`,
    `${t('pdf.ledgerRecordLabel', "Ledger record")}          : ${t('pdf.permanentLifetime', "Permanent (lifetime)")}`
  ];

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10.5);
  pdf.setTextColor(39, 39, 42);
  premiumLines.forEach(line => {
    pdf.text(line, 20, y);
    y += 7.6;
  });

  y += 6;
  pdf.setDrawColor(234, 179, 8);
  pdf.setLineWidth(0.8);
  pdf.line(20, y, 190, y);
  y += 11;

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(11);
  pdf.setTextColor(24, 24, 27);
  pdf.text(t('pdf.officialStatementHeader', "Official Statement"), 20, y);
  y += 8;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9.5);
  pdf.setTextColor(63, 63, 70);
  pdf.text(t('pdf.officialStatement1', "This Official Independent Citizen Press Credential certifies that the holder is a"), 20, y);
  pdf.text(t('pdf.officialStatement2', "zero-knowledge verified and active contributor on the VocalWitness network. It"), 20, y + 5.5);
  pdf.text(t('pdf.officialStatement3', "reflects sustained participation in citizen journalism and public-interest reporting"), 20, y + 11);
  pdf.text(t('pdf.officialStatement4', "on the ground. This document is permanently registered on the public ledger."), 20, y + 16.5);
  pdf.text(t('pdf.officialStatement5', "Money never buys a higher truth rank or voting power on VocalWitness."), 20, y + 22);

  // QR with gold border
  const qrData = await generateQRCodeDataUrl(verificationUrl, 140);
  if (qrData) {
    try {
      pdf.setDrawColor(234, 179, 8);
      pdf.setLineWidth(1.3);
      pdf.rect(148, 178, 42, 42);
      pdf.addImage(qrData, 'PNG', 150, 180, 38, 38);
    } catch (e) {}
  }

  // Dark verification box – PREMIUM gets full URL + clear instruction
  pdf.setFillColor(24, 24, 27);
  pdf.roundedRect(20, 228, 120, 42, 4, 4, 'F');

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.setTextColor(250, 204, 21);
  pdf.text(t('pdf.publicVerificationPortalHeader', "PUBLIC VERIFICATION PORTAL"), 28, 238);

  pdf.setFont("courier", "normal");
  pdf.setFontSize(6.8);
  pdf.setTextColor(52, 211, 153);
  // Full URL (wraps if needed)
  const urlLines = pdf.splitTextToSize(verificationUrl, 108);
  pdf.text(urlLines, 28, 246);

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7);
  pdf.setTextColor(161, 161, 170);
  pdf.text(t('pdf.verificationInstruction1', "Scan the QR code or open the link above to confirm"), 28, 258);
  pdf.text(t('pdf.verificationInstruction2', "this credential is authentic on VocalWitness."), 28, 263);

  pdf.save(`Independent_Citizen_Press_Credential_Official_${docId.slice(0, 8)}.pdf`);
}

/* ============================================================
   UPGRADE / PAYWALL MODAL (Official only)
   ============================================================ */
export function showPremiumUpgradeModal(userData, db) {
  document.getElementById('premiumUpgradeModal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'premiumUpgradeModal';
  modal.className = 'fixed inset-0 z-[10060] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm';

  modal.innerHTML = `
    <div class="relative w-full max-w-md rounded-3xl border border-amber-500/30 bg-zinc-900 p-6 shadow-2xl text-white">
      <button id="closePremiumModal" type="button"
              class="absolute top-4 right-4 text-zinc-400 hover:text-white text-xl leading-none cursor-pointer"
              aria-label="${t('common.close', 'Close')}">&times;</button>
      
      <div class="text-center mb-5">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 mb-3">
          <span class="text-2xl">🎖️</span>
        </div>
        <h3 class="text-xl font-bold text-amber-400" data-i18n="pdf.modalTitle">${t('pdf.modalTitle', "Official Independent Citizen Press Credential")}</h3>
        <p class="text-sm text-zinc-400 mt-1" data-i18n="pdf.modalSub">${t('pdf.modalSub', "Formal credential for external presentation")}</p>
      </div>

      <div class="space-y-3 mb-6 text-sm">
        <div class="flex items-start gap-3">
          <span class="text-emerald-400 mt-0.5">✓</span>
          <span data-i18n="pdf.modalFeature1">${t('pdf.modalFeature1', "Formal format with ZK seal — for press, partners, institutions")}</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-emerald-400 mt-0.5">✓</span>
          <span data-i18n="pdf.modalFeature2">${t('pdf.modalFeature2', "Profile photo / monogram with gold ring")}</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-emerald-400 mt-0.5">✓</span>
          <span data-i18n="pdf.modalFeature3">${t('pdf.modalFeature3', "Full activity record • 1-year display validity + lifetime ledger record")}</span>
        </div>
        <div class="flex items-start gap-3">
          <span class="text-emerald-400 mt-0.5">✓</span>
          <span data-i18n="pdf.modalFeature4">${t('pdf.modalFeature4', "Stronger weight when others must take the document seriously")}</span>
        </div>
      </div>

      <div class="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 mb-5 text-center">
        <div class="text-2xl font-bold text-white">$2.99</div>
        <div class="text-xs text-zinc-400 mt-1" data-i18n="pdf.modalPriceNote">${t('pdf.modalPriceNote', "One-time download • Does not change your membership tier")}</div>
      </div>

      <div class="flex flex-col gap-3">
        <button id="upgradeToPremiumBtn" type="button"
                class="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black font-bold transition cursor-pointer"
                data-i18n="pdf.btnPay">${t('pdf.btnPay', "Pay $2.99 & Download Official Credential")}</button>
        <button id="downloadStandardInstead" type="button"
                class="w-full py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition cursor-pointer"
                data-i18n="pdf.btnDownloadStandard">${t('pdf.btnDownloadStandard', "Download Standard Credential (Free)")}</button>
      </div>

      <p class="text-[11px] text-zinc-500 text-center mt-4" data-i18n="pdf.modalFooter">${t('pdf.modalFooter', "Gold & higher members receive 1 free Official Credential every month. The public ledger record is permanent; the display date is a recommended presentation window.")}</p>
    </div>
  `;

  document.body.appendChild(modal);

  document.getElementById('closePremiumModal')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  document.getElementById('upgradeToPremiumBtn')?.addEventListener('click', async () => {
    modal.remove();
    showToast(t('pdf.toastRedirectStripe', "Redirecting to secure Stripe checkout..."), "info");

    try {
      if (window.createStripeCheckoutSession) {
        await window.createStripeCheckoutSession({
          priceId: 'price_vocalwitness_premium_cert',
          userId: userData.uid || userData.authorId,
          successUrl: window.location.href,
          cancelUrl: window.location.href
        });
      } else if (typeof window.openSupportModal === 'function') {
        window.openSupportModal();
      } else {
        showToast(t('pdf.toastPaymentNotAvail', "Payment is not available yet. Try Standard for free, or contact support."), "warning");
      }
    } catch (err) {
      console.error("Payment redirection failed:", err);
      showToast(t('pdf.toastPaymentError', "Unable to initiate payment gateway"), "error");
    }
  });

  document.getElementById('downloadStandardInstead')?.addEventListener('click', () => {
    modal.remove();
    generateAndDownloadPDF(userData, db, 'standard');
  });
}
