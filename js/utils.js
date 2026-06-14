/**
 * VocalWitness Utilities Module
 */

export function showToast(message, type = "success") {
    const toast = document.createElement('div');
    const bgColor = type === 'error' ? 'bg-red-600' : 'bg-emerald-600';
    toast.className = `fixed bottom-5 right-5 p-4 rounded-2xl shadow-2xl z-[100] text-white font-bold text-sm ${bgColor}`;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

export function isLowDataMode() {
    return localStorage.getItem('lowDataMode') === 'true';
}

export function toggleLowDataMode() {
    const current = isLowDataMode();
    localStorage.setItem('lowDataMode', !current);
    location.reload();
}

export async function executeAction(actionFn, buttonEl, loadingText = "Processing...") {
    const originalText = buttonEl.textContent;
    
    // 1. Enter Pending State
    buttonEl.disabled = true;
    buttonEl.textContent = loadingText;

    try {
        // 2. Perform the action
        await actionFn();
    } catch (error) {
        console.error("Action Failed:", error);
        // Integrated showToast instead of browser alert
        showToast("Operation failed. Please check your connection.", "error");
    } finally {
        // 3. Reset State
        buttonEl.disabled = false;
        buttonEl.textContent = originalText;
    }
}

export async function generateSha256Hash(fileOrString) {
    const data = (typeof fileOrString === 'string') 
        ? new TextEncoder().encode(fileOrString) 
        : await fileOrString.arrayBuffer();
        
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function submitPeerVote(postId, voteType) {
    try {
        // Example: Replace with your actual Firebase/Firestore logic
        // await db.collection('votes').add({ postId, voteType, timestamp: Date.now() });
        showToast("✅ Vote submitted successfully");
    } catch (error) {
        console.error("Voting failed:", error);
        showToast("❌ Failed to submit vote", "error");
    }
}

// updated
export function initLanguage() {
    // ... your existing code ...
}

export function translateUIElements(langCode) {
    // ... your existing code ...
}
