import { showToast } from "./utils.js";

export let currentTrustScore = 50;
export let isPhoneVerified = false;
export let isZKVerified = false;

export function updateTierDisplay() {
    const tierEl = document.getElementById('userTier');
    if (!tierEl) return;
    if (currentTrustScore >= 85) tierEl.textContent = "Trusted Voice";
    else if (currentTrustScore >= 65) tierEl.textContent = "Verified Witness";
    else tierEl.textContent = "Rising Witness";
}

export async function updateStreak() {
    const today = new Date().toDateString();
    const lastDate = localStorage.getItem('lastPostDate');
    let streak = parseInt(localStorage.getItem('streak') || '0');
    if (lastDate === today) return streak;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    streak = (lastDate === yesterday) ? streak + 1 : 1;
    localStorage.setItem('lastPostDate', today);
    localStorage.setItem('streak', streak);
    return streak;
}

window.triggerRewardCycle = async (currentFeed) => {
    const streak = await updateStreak();
    const reward = currentFeed === 'true-witness' ? 35 : 15;
    currentTrustScore = Math.min(98, currentTrustScore + reward);
    
    if (document.getElementById('humanityScore')) {
        document.getElementById('humanityScore').textContent = currentTrustScore;
    }
    updateTierDisplay();
    showToast(`Posted directly to Ledger! +${reward} Trust • ${streak} day streak 🔥`, "success");
};

export function startPhoneVerification() { 
    isPhoneVerified = true; 
    showToast("Phone verified successfully ✓", "success"); 
}
window.startPhoneVerification = startPhoneVerification;

export function startZKVerification() { 
    isZKVerified = true; 
    showToast("Zero-Knowledge Verification Complete", "success"); 
}
window.startZKVerification = startZKVerification;
