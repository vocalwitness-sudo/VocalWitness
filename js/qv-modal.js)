// js/qv-modal.js - Quadratic Voting Modal Logic
import { castQuadraticVote } from './dao.js';
import { showToast } from './utils.js';

let activeProposalId = null;
let selectedDirection = 'for';
let userSpentBudget = 0; // Current spent points fetched from proposal voteLog

/**
 * Open the Quadratic Voting Modal
 */
export function openQuadraticVoteModal(proposalId, proposalTitle, alreadySpent = 0) {
    activeProposalId = proposalId;
    userSpentBudget = alreadySpent;
    selectedDirection = 'for';

    const modal = document.getElementById('quadratic-vote-modal');
    const titleEl = document.getElementById('qv-modal-title');
    const slider = document.getElementById('qv-strength-slider');

    if (!modal) return;

    titleEl.textContent = proposalTitle || "DAO Proposal";
    slider.value = 1;

    // Reset Direction Buttons
    setDirection('for');
    updateCostCalculation(1);

    modal.classList.remove('hidden');
}

/**
 * Close Modal
 */
export function closeQuadraticVoteModal() {
    const modal = document.getElementById('quadratic-vote-modal');
    if (modal) modal.classList.add('hidden');
    activeProposalId = null;
}

/**
 * Set Voting Direction UI State
 */
function setDirection(direction) {
    selectedDirection = direction;
    const btnFor = document.getElementById('qv-btn-for');
    const btnAgainst = document.getElementById('qv-btn-against');

    if (direction === 'for') {
        btnFor.className = "qv-direction-btn flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-emerald-500/50 bg-emerald-500/20 text-emerald-400 font-semibold text-sm transition";
        btnAgainst.className = "qv-direction-btn flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-800/50 text-slate-400 font-semibold text-sm hover:bg-rose-500/10 hover:text-rose-400 transition";
    } else {
        btnAgainst.className = "qv-direction-btn flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-rose-500/50 bg-rose-500/20 text-rose-400 font-semibold text-sm transition";
        btnFor.className = "qv-direction-btn flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl border border-slate-800 bg-slate-800/50 text-slate-400 font-semibold text-sm hover:bg-emerald-500/10 hover:text-emerald-400 transition";
    }
}

/**
 * Calculate quadratic cost & update UI preview in real-time
 */
function updateCostCalculation(strength) {
    const cost = strength * strength;
    const totalAfterVote = userSpentBudget + cost;

    const strengthBadge = document.getElementById('qv-strength-badge');
    const costPreview = document.getElementById('qv-cost-preview');
    const budgetRemaining = document.getElementById('qv-budget-remaining');
    const budgetBar = document.getElementById('qv-budget-bar');
    const submitBtn = document.getElementById('qv-submit-vote-btn');

    strengthBadge.textContent = `${strength} Vote${strength > 1 ? 's' : ''}`;
    costPreview.textContent = `${cost} Power Point${cost > 1 ? 's' : ''}`;

    const remaining = Math.max(0, 25 - totalAfterVote);
    budgetRemaining.textContent = `${remaining} / 25 pts remaining`;

    const percentage = Math.min(100, (totalAfterVote / 25) * 100);
    budgetBar.style.width = `${percentage}%`;

    // Visual Alert if Over Budget
    if (totalAfterVote > 25) {
        budgetBar.className = "h-full bg-rose-500 transition-all duration-300";
        submitBtn.disabled = true;
        submitBtn.classList.add("opacity-50", "cursor-not-allowed");
    } else {
        budgetBar.className = "h-full bg-blue-500 transition-all duration-300";
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }
}

// Event Listeners Initialization
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('quadratic-vote-modal');
    if (!modal) return;

    // Close button
    document.getElementById('qv-close-btn')?.addEventListener('click', closeQuadraticVoteModal);

    // Direction switches
    document.getElementById('qv-btn-for')?.addEventListener('click', () => setDirection('for'));
    document.getElementById('qv-btn-against')?.addEventListener('click', () => setDirection('against'));

    // Slider input
    const slider = document.getElementById('qv-strength-slider');
    slider?.addEventListener('input', (e) => {
        updateCostCalculation(parseInt(e.target.value, 10));
    });

    // Submit Vote
    document.getElementById('qv-submit-vote-btn')?.addEventListener('click', async () => {
        if (!activeProposalId) return;

        const strength = parseInt(slider.value, 10);
        
        try {
            await castQuadraticVote(activeProposalId, selectedDirection, strength);
            closeQuadraticVoteModal();
        } catch (err) {
            console.error("Voting submit error:", err);
            showToast("Failed to cast vote", "error");
        }
    });
});
