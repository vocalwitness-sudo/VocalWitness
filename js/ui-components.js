// js/ui-components.js - Advanced Radial Tier Circles
export function renderTierCircle(positionOrTier, reputation = 0) {
  let percentage = 0;
  let color = '#64748b';
  let label = 'Citizen';
  let subLabel = 'Explorer';
  let emblem = '👤';

  if (typeof positionOrTier === 'object' && positionOrTier.name) {
    // Witness Circle Position
    percentage = Math.min(100, Math.floor((reputation / 400) * 100)); // scale to next level
    color = positionOrTier.color || '#a855f7';
    label = positionOrTier.name;
    subLabel = 'Witness Circle';
    emblem = positionOrTier.emblem || '🔵';
  } else if (positionOrTier === 'citizen_circle') {
    percentage = 75; // or calculate based on phone verification progress
    color = '#10b981';
    label = 'Citizen Circle';
    subLabel = 'Phone Verified';
    emblem = '🛡️';
  } else {
    percentage = Math.min(45, Math.floor((reputation / 100) * 100));
    color = '#64748b';
    label = 'Citizen';
    subLabel = 'Base Tier';
    emblem = '👤';
  }

  return `
    <div class="relative w-28 h-28 flex items-center justify-center">
      <!-- Background Circle -->
      <svg class="w-28 h-28 -rotate-90" viewBox="0 0 42 42">
        <circle cx="21" cy="21" r="15" fill="none" stroke="#1f2937" stroke-width="6"></circle>
        <!-- Progress Circle -->
        <circle 
          cx="21" cy="21" r="15" 
          fill="none" 
          stroke="${color}" 
          stroke-width="6"
          stroke-dasharray="${percentage * 0.94} 94"
          stroke-linecap="round"
          stroke-linejoin="round"
        ></circle>
      </svg>
      
      <!-- Center Content -->
      <div class="absolute text-center">
        <div class="text-4xl mb-1">${emblem}</div>
        <div class="text-xs font-bold text-white tracking-wider">${label}</div>
        <div class="text-[10px] text-zinc-400">${subLabel}</div>
        <div class="text-[10px] font-mono text-emerald-400 mt-1">${percentage}%</div>
      </div>
    </div>
  `;
}

// Helper to update badge
export function updateTierBadge(containerId = 'profile-tier-badge') {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Example usage - call with real data
  container.innerHTML = renderTierCircle('witness_circle', 180); // or pass position object
}
