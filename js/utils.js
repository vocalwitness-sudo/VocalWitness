/**
 * VocalWitness Utilities Module
 * Toast, Tier System, Trust Score, Helpers
 */

export function showToast(message, type = "success") {
    const toast = document.createElement('div');
    const bgColor = type === 'error' ? 'bg-red-600' : 'bg-emerald-600';
    const icon = type === 'error' ? '❌' : '✅';
    
    toast.className = `fixed bottom-5 right-5 p-4 rounded-2xl shadow-2xl z-[100] text-white font-medium text-sm flex items-center gap-2 ${bgColor} transition-all`;
    toast.innerHTML = `${icon} ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/**
 * Low Data Mode
 */
export function isLowDataMode() {
    return localStorage.getItem('lowDataMode') === 'true';
}

export function toggleLowDataMode() {
    const current = isLowDataMode();
    localStorage.setItem('lowDataMode', !current);
    showToast(!current ? "Low Data Mode Enabled" : "Low Data Mode Disabled");
    location.reload();
}

/**
 * Safe async button action wrapper
 */
export async function executeAction(actionFn, buttonEl, loadingText = "Processing...") {
    if (!buttonEl) return;
    
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

/**
 * SHA-256 Hash Generator
 */
export async function generateSha256Hash(fileOrString) {
    try {
        const data = (typeof fileOrString === 'string')
            ? new TextEncoder().encode(fileOrString)
            : await fileOrString.arrayBuffer();
        
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
        console.error("Hash generation failed", e);
        return null;
    }
}

/**
 * Peer Voting (Verify / Dispute)
 */
export async function submitPeerVote(postId, voteType) {
    try {
        // TODO: Connect to actual Firestore votes collection
        console.log(`Vote submitted: ${voteType} on post ${postId}`);
        showToast(voteType === 'verify' 
            ? "✅ Vote submitted - Thank you for helping verify truth!" 
            : "⚠️ Dispute submitted");
    } catch (error) {
        console.error("Voting failed:", error);
        showToast("❌ Failed to submit vote", "error");
    }
}

/**
 * Tier System + Trust Score
 */
export function getTier(trustScore = 0) {
    if (trustScore >= 100) {
        return {
            name: 'Premium',
            color: '#FFD700',
            canDownload: true,
            badge: '🌟 Verified Truth-Bearer',
            level: 4
        };
    }
    if (trustScore >= 80) {
        return {
            name: 'Gold',
            color: '#FFD700',
            canDownload: true,
            badge: 'Elite Witness',
            level: 3
        };
    }
    if (trustScore >= 60) {
        return {
            name: 'Silver',
            color: '#C0C0C0',
            canDownload: true,
            badge: 'Trusted',
            level: 2
        };
    }
    if (trustScore >= 40) {
        return {
            name: 'Bronze',
            color: '#CD7F32',
            canDownload: true,
            badge: 'Verified Citizen',
            level: 1
        };
    }
    return {
        name: 'Explorer',
        color: '#808080',
        canDownload: false,
        badge: 'New Citizen',
        level: 0
    };
}

export function calculateTrustScore(userData = {}) {
    const { 
        successfulEvidence = 0, 
        endorsementsReceived = 0, 
        debunkedEvidence = 0,
        testimoniesCount = 0 
    } = userData;

    let trust = (successfulEvidence * 5) + (endorsementsReceived * 2) - (debunkedEvidence * 10);
    trust += Math.floor(testimoniesCount * 0.5); // Bonus for activity

    return Math.max(0, Math.min(100, Math.round(trust)));
}

// Make submitPeerVote available globally for inline onclick handlers
window.submitPeerVote = submitPeerVote;

// Escalate
export async function escalatePost(postId) {
  const tier = await getCurrentUserTier();
  if (!canAccessFeature(tier, 'escalate_post')) {  // add this permission if not present
    showToast("Higher tier required", "error");
    return false;
  }
  showToast("🛡️ Escalating post to True Witness...", "info");
  // Later: add proof generation here
  return true;
}
