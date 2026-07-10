import { db, auth } from './firebase-config.js';   // Correct relative path

console.log("✅ utils.js is being loaded as MODULE");

/* ====================== TOAST NOTIFICATION ====================== */

export function showToast(message, type = "success") {
    const styles = {
        success: { bg: 'bg-emerald-600', icon: '✅' },
        error:   { bg: 'bg-red-600',    icon: '❌' },
        warning: { bg: 'bg-amber-600',  icon: '⚠️' },
        info:    { bg: 'bg-sky-600',    icon: 'ℹ️' }
    };

    const { bg, icon } = styles[type] || styles.success;

    // Create the element dynamically
    const toast = document.createElement('div');
    
    toast.className = `
        fixed bottom-5 right-5 p-4 rounded-2xl shadow-2xl z-[100] 
        text-white font-medium text-sm flex items-center gap-2 
        ${bg} transition-all duration-300
    `;
    
    toast.innerHTML = `${icon} ${message}`;
    document.body.appendChild(toast);

    // Fade out and remove
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 350);
    }, 3000);
}

/* ====================== DATA & PERFORMANCE ====================== */

export function isLowDataMode() {
    return localStorage.getItem('lowDataMode') === 'true';
}

export function toggleLowDataMode() {
    const current = isLowDataMode();
    localStorage.setItem('lowDataMode', !current);
    
    showToast(!current ? "Low Data Mode Enabled" : "Low Data Mode Disabled", "info");
    setTimeout(() => location.reload(), 800);
}

/* ====================== SAFE ACTION WRAPPER ====================== */

export async function executeAction(actionFn, buttonEl, loadingText = "Processing...") {
    if (!buttonEl || typeof actionFn !== 'function') return;

    const originalText = buttonEl.textContent || buttonEl.innerHTML;

    buttonEl.disabled = true;
    buttonEl.textContent = loadingText;

    try {
        await actionFn();
    } catch (error) {
        console.error("Action Failed:", error);
        showToast("Operation failed. Please check your connection.", "error");
    } finally {
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
    }
}

/* ====================== CRYPTO & FORENSICS ====================== */

export async function generateSha256Hash(input) {
    try {
        const data = (typeof input === 'string')
            ? new TextEncoder().encode(input)
            : await input.arrayBuffer();

        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    } catch (e) {
        console.error("Hash generation failed:", e);
        return null;
    }
}

/* ====================== PEER VOTING ====================== */

export async function submitPeerVote(postId, voteType) {
    if (!postId) return;

    try {
        // TODO: Connect to Firestore votes collection
        console.log(`Vote submitted: ${voteType} on post ${postId}`);

        showToast(
            voteType === 'verify' 
                ? "✅ Thank you for helping verify truth!" 
                : "⚠️ Dispute submitted. Thank you for your vigilance.",
            voteType === 'verify' ? "success" : "warning"
        );
    } catch (error) {
        console.error("Voting failed:", error);
        showToast("❌ Failed to submit vote", "error");
    }
}

/* ====================== TIER & TRUST SYSTEM ====================== */

export function getTier(trustScore = 0) {
    if (trustScore >= 100) {
        return { name: 'Premium', color: '#FFD700', canDownload: true, badge: '🌟 Verified Truth-Bearer', level: 4 };
    }
    if (trustScore >= 80) {
        return { name: 'Gold', color: '#FFD700', canDownload: true, badge: 'Elite Witness', level: 3 };
    }
    if (trustScore >= 60) {
        return { name: 'Silver', color: '#C0C0C0', canDownload: true, badge: 'Trusted Witness', level: 2 };
    }
    if (trustScore >= 40) {
        return { name: 'Bronze', color: '#CD7F32', canDownload: true, badge: 'Verified Citizen', level: 1 };
    }
    return { name: 'Explorer', color: '#808080', canDownload: false, badge: 'New Citizen', level: 0 };
}

export function calculateTrustScore(userData = {}) {
    const {
        successfulEvidence = 0,
        endorsementsReceived = 0,
        debunkedEvidence = 0,
        testimoniesCount = 0
    } = userData;

    let trust = (successfulEvidence * 5) + 
                (endorsementsReceived * 2) - 
                (debunkedEvidence * 10);

    trust += Math.floor(testimoniesCount * 0.5); // Activity bonus

    return Math.max(0, Math.min(100, Math.round(trust)));
}

/* ====================== GLOBAL EXPORTS ====================== */

window.submitPeerVote = submitPeerVote;
window.showToast = showToast;
window.goBack = function() {
    if (window.history.length > 1) {
        window.history.back();
    } else {
        window.location.href = 'index.html';
    }
};

/* ====================== FUTURE HELPERS ====================== */

export async function escalatePost(postId) {
    // TODO: Check user tier permission
    showToast("🛡️ Escalating post to True Witness review...", "info");
    return true;
}
