// js/support-modal.js
import { giveSupport, getRemainingSupportBudget } from './reputation.js';
import { showToast } from './utils.js';

export async function showSupportModal(targetUserId, targetDisplayName = "this Witness") {
  // Remove existing modal if any
  document.getElementById('supportModal')?.remove();

  const remainingBudget = await getRemainingSupportBudget();

  const modal = document.createElement('div');
  modal.id = 'supportModal';
  modal.className = 'fixed inset-0 z-[10060] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm';
  
  modal.innerHTML = `
    <div class="relative w-full max-w-md rounded-3xl border border-emerald-500/30 bg-zinc-900 p-6 shadow-2xl text-white">
      <button id="closeSupportModal" class="absolute top-4 right-4 text-zinc-400 hover:text-white text-xl leading-none">&times;</button>

      <div class="text-center mb-5">
        <div class="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 mb-3">
          <span class="text-2xl">✨</span>
        </div>
        <h3 class="text-xl font-bold text-emerald-400">Support this Witness</h3>
        <p class="text-sm text-zinc-400 mt-1">Speak for the shine of <span class="text-white font-medium">${targetDisplayName}</span></p>
      </div>

      <div class="bg-zinc-950 border border-zinc-800 rounded-2xl p-4 mb-5 text-center">
        <div class="text-sm text-zinc-400">Your remaining daily budget</div>
        <div class="text-2xl font-bold text-white mt-1">${remainingBudget} points</div>
      </div>

      <div class="mb-5">
        <label class="text-xs text-zinc-400 block mb-2">Support Strength (1–5)</label>
        <div class="flex gap-2" id="supportStrengthButtons">
          <button data-s="1" class="strength-btn flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium">1</button>
          <button data-s="2" class="strength-btn flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium">2</button>
          <button data-s="3" class="strength-btn flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium">3</button>
          <button data-s="4" class="strength-btn flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium">4</button>
          <button data-s="5" class="strength-btn flex-1 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-sm font-medium">5</button>
        </div>
        <p class="text-[11px] text-zinc-500 mt-2 text-center">
          Cost = strength² • Higher strength = stronger support
        </p>
      </div>

      <div class="space-y-2 text-xs text-zinc-400 mb-6">
        <div class="flex items-start gap-2">
          <span class="text-emerald-400">•</span>
          <span>You can support the same person only once every 10 days</span>
        </div>
        <div class="flex items-start gap-2">
          <span class="text-emerald-400">•</span>
          <span>Support has diminishing returns at higher reputation</span>
        </div>
      </div>

      <div class="flex flex-col gap-3">
        <button id="confirmSupportBtn" class="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-bold transition">
          Support with Strength 3
        </button>
        <button id="cancelSupportBtn" class="w-full py-2.5 rounded-xl border border-zinc-700 text-zinc-300 hover:bg-zinc-800 text-sm transition">
          Cancel
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  let selectedStrength = 3;

  // Strength buttons
  modal.querySelectorAll('.strength-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedStrength = parseInt(btn.dataset.s);
      
      modal.querySelectorAll('.strength-btn').forEach(b => {
        b.classList.remove('bg-emerald-600', 'text-white');
        b.classList.add('bg-zinc-800');
      });
      btn.classList.add('bg-emerald-600', 'text-white');
      btn.classList.remove('bg-zinc-800');

      document.getElementById('confirmSupportBtn').textContent = `Support with Strength ${selectedStrength}`;
    });
  });

  // Close buttons
  document.getElementById('closeSupportModal').onclick = () => modal.remove();
  document.getElementById('cancelSupportBtn').onclick = () => modal.remove();
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });

  // Confirm
  document.getElementById('confirmSupportBtn').onclick = async () => {
    const btn = document.getElementById('confirmSupportBtn');
    btn.disabled = true;
    btn.textContent = "Supporting...";

    const success = await giveSupport(targetUserId, selectedStrength);
    
    if (success) {
      modal.remove();
    } else {
      btn.disabled = false;
      btn.textContent = `Support with Strength ${selectedStrength}`;
    }
  };
}
