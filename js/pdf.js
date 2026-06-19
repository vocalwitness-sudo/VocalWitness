// js/pdf.js
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { getTier, calculateTrustScore } from './utils.js';

export async function generateAndDownloadPDF(user, db) {
    const statusEl = document.getElementById('pdf-status');
    
    if (!user) {
        statusEl.innerHTML = "❌ Please sign in first";
        return;
    }

    const trustScore = calculateTrustScore(user);
    const tier = getTier(trustScore);

    if (!tier.canDownload) {
        statusEl.innerHTML = `🔒 Reach <strong>Bronze (40+ trust)</strong> to unlock PDF download.`;
        return;
    }

    try {
        const token = crypto.randomUUID();

        // Save Witness Token to Ledger
        await setDoc(doc(db, "verifiable_docs", token), {
            ownerId: user.uid,
            timestamp: new Date().toISOString(),
            trustScore: trustScore,
            tier: tier.name,
            verified: true,
            status: "active"
        });

        // Generate PDF
        const { jsPDF } = await import("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
        const pdf = new jsPDF();

        pdf.setFontSize(22);
        pdf.text("VocalWitness Witness Token", 20, 30);

        pdf.setFontSize(14);
        pdf.text(`Holder: ${user.displayName || user.email || "Witness"}`, 20, 50);
        pdf.text(`Tier: ${tier.name} (Level ${tier.level})`, 20, 60);
        pdf.text(`Trust Score: ${trustScore}%`, 20, 70);
        pdf.text(`Witness Token ID: ${token}`, 20, 80);
        pdf.text(`Issued: ${new Date().toLocaleDateString()}`, 20, 90);

        pdf.setFontSize(11);
        pdf.text("Verify this document here:", 20, 110);
        pdf.text(`https://vocalwitness-sudo.github.io/VocalWitness/verify.html?id=${token}`, 20, 120);

        pdf.text("This token is cryptographically linked to the VocalWitness Ledger.", 20, 145);
        pdf.text("Any alteration will invalidate its authenticity.", 20, 155);

        pdf.save(`WitnessToken_${tier.name}_${token.slice(0,8)}.pdf`);

        statusEl.innerHTML = "✅ Witness Token PDF downloaded & engraved!";
        showToast("Witness Token successfully engraved to the Ledger", "success");

    } catch (error) {
        console.error("PDF Generation Error:", error);
        statusEl.innerHTML = "❌ Error generating PDF. Check console.";
        showToast("Failed to generate PDF", "error");
    }
}
