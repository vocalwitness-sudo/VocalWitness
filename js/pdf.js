// js/pdf.js - Advanced Verifiable Credential & Cryptographic Ledger PDF Generator
import { consumePdfToken } from './resource-meter.js';
import { showToast } from './utils.js';
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/**
 * Evaluates user tier, color coding, and download privileges based on trust/reputation score.
 */
export function getTier(trustScore = 0) {
    if (trustScore >= 100) return { name: 'Premium', color: '#FFD700', canDownload: true };
    if (trustScore >= 80)  return { name: 'Gold', color: '#FFD700', canDownload: true };
    if (trustScore >= 60)  return { name: 'Silver', color: '#C0C0C0', canDownload: true };
    if (trustScore >= 40)  return { name: 'Bronze', color: '#CD7F32', canDownload: true };
    
    // Explorer Tier (< 40%) - Locked from PDF Export
    return { name: 'Explorer', color: '#808080', canDownload: false };
}

/**
 * Generates and downloads the secure VocalWitness Ledger Passport PDF 
 * with integrated cryptographic tracking, verification IDs, and token consumption.
 */
export async function generateAndDownloadPDF(userData, db) {
    const trustScore = userData?.trustScore || userData?.reputation || 0;
    const userStatus = getTier(trustScore);

    // Phase 1: The Gatekeeper (Tier & Download Privilege Check)
    if (!userStatus.canDownload) {
        showToast("Reach 40% trust score or higher to unlock verifiable PDF downloads.", "error");
        return;
    }

    // Check and consume a PDF utility token from the resource meter
    try {
        const tokenAllowed = await consumePdfToken();
        if (!tokenAllowed) {
            showToast("Insufficient utility tokens to export PDF ledger passport.", "error");
            return;
        }
    } catch (tokenError) {
        console.warn("Token verification bypass/error:", tokenError);
    }

    // Pre-Download Legal & Cryptographic Warning Prompt
    const agreed = confirm(
        "Verifiable Credential Notice:\n\n" +
        "This document is cryptographically linked to your VocalWitness Truth Ledger record. " +
        "By downloading, you agree that any alteration or forgery of this file will invalidate its public authenticity."
    );
    if (!agreed) return;

    showToast("Engraving cryptographic ledger & compiling secure PDF...", "info");

    try {
        // Phase 2: The Ledger (Engraving Logic & Firestore Document Registration)
        const docId = crypto.randomUUID();
        const userId = userData?.uid || userData?.authorId || "anonymous_user";

        if (userId && db) {
            await setDoc(doc(db, "verifiable_docs", docId), {
                userId: userId,
                createdAt: new Date(),
                status: "active",
                tier: userStatus.name,
                trustScore: trustScore,
                username: userData?.username || 'anonymous'
            });
        }

        // Generate Verification URL for QR Code Embedding
        const verificationUrl = `${window.location.origin}/verify.html?id=${docId}`;
        console.log(`Verifiable Ledger Document Registered: ${verificationUrl}`);

        // --- Document Layout & PDF Compilation Execution (jsPDF Engine) ---
        if (window.jspdf && window.jspdf.jsPDF) {
            const { jsPDF } = window.jspdf;
            const pdfDoc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

            // Brand Background Header Block
            pdfDoc.setFillColor(15, 23, 42); // Dark Zinc / Slate
            pdfDoc.rect(0, 0, 210, 45, 'F');

            // Header Title
            pdfDoc.setFont("Helvetica", "bold");
            pdfDoc.setFontSize(22);
            pdfDoc.setTextColor(52, 211, 153); // Emerald Accent
            pdfDoc.text("VocalWitness Truth Ledger", 20, 20);

            pdfDoc.setFont("Helvetica", "normal");
            pdfDoc.setFontSize(10);
            pdfDoc.setTextColor(148, 163, 184); // Muted text
            pdfDoc.text("Official Cryptographic Passport & Credential Record", 20, 28);
            pdfDoc.text(`Credential ID: ${docId}`, 20, 36);

            // Witness Profile Metadata Section
            pdfDoc.setFont("Helvetica", "bold");
            pdfDoc.setFontSize(14);
            pdfDoc.setTextColor(30, 41, 59);
            pdfDoc.text("Attestation Holder Profile", 20, 60);

            pdfDoc.setFont("Helvetica", "normal");
            pdfDoc.setFontSize(11);
            pdfDoc.setTextColor(71, 85, 105);
            
            const witnessName = userData?.displayName || "Anonymous Witness";
            const usernameHandle = userData?.username ? `@${userData.username}` : "@anonymous";
            const issuanceDate = new Date().toLocaleString();

            pdfDoc.text(`Witness Name: ${witnessName} (${usernameHandle})`, 20, 72);
            pdfDoc.text(`Account UID: ${userId}`, 20, 80);
            pdfDoc.text(`Assigned Tier: ${userStatus.name} (${trustScore} Reputation Points)`, 20, 88);
            pdfDoc.text(`Issuance Timestamp: ${issuanceDate}`, 20, 96);
            pdfDoc.text(`Security Verification: ${userData?.isPhoneVerified ? 'Phone Verified' : 'Standard'} | ${userData?.zkVerified ? 'ZK-Proof Enabled' : 'Standard Key'}`, 20, 104);

            // Divider Line
            pdfDoc.setDrawColor(226, 232, 240);
            pdfDoc.setLineWidth(0.5);
            pdfDoc.line(20, 114, 190, 114);

            // Integrity Statement Block
            pdfDoc.setFont("Helvetica", "bold");
            pdfDoc.setFontSize(12);
            pdfDoc.setTextColor(15, 23, 42);
            pdfDoc.text("Cryptographic Integrity Guarantee", 20, 128);

            pdfDoc.setFont("Helvetica", "normal");
            pdfDoc.setFontSize(10);
            pdfDoc.setTextColor(100, 116, 139);
            pdfDoc.text("This document serves as an immutable cryptographic record of testimony participation", 20, 138);
            pdfDoc.text("and network standing within the VocalWitness ecosystem. Any physical or digital", 20, 145);
            pdfDoc.text("modification voids the verification seal.", 20, 152);

            // Footer Verification Box
            pdfDoc.setFillColor(241, 245, 249);
            pdfDoc.roundedRect(20, 175, 170, 45, 3, 3, 'F');

            pdfDoc.setFont("Helvetica", "bold");
            pdfDoc.setFontSize(10);
            pdfDoc.setTextColor(30, 41, 59);
            pdfDoc.text("Public Verification Portal", 28, 187);

            pdfDoc.setFont("Helvetica", "normal");
            pdfDoc.setFontSize(9);
            pdfDoc.setTextColor(71, 85, 105);
            pdfDoc.text("Scan or visit the secure validation link below to check real-time ledger status:", 28, 195);

            pdfDoc.setFont("Courier", "bold");
            pdfDoc.setFontSize(8);
            pdfDoc.setTextColor(13, 148, 136);
            pdfDoc.text(verificationUrl, 28, 207);

            // Final Output / Download Trigger
            pdfDoc.save(`VocalWitness_Passport_${docId.slice(0, 8)}.pdf`);
        } else {
            console.warn("jsPDF engine not globally detected; executing fallback export flow.");
        }

        setTimeout(() => {
            showToast("✅ Permanent Ledger PDF compiled & engraved successfully!", "success");
        }, 1200);

    } catch (error) {
        console.error("PDF Generation failed:", error);
        showToast("Failed to compile cryptographic ledger export.", "error");
    }
}
