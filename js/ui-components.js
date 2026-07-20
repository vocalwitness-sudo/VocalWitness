// js/ui-components.js - Advanced Radial Tier Circles
export function renderTierCircle(tier = 'citizen', reputation = 0) {
    let percentage = 0;
    let color = '#64748b';
    let label = 'Citizen';
    let subLabel = 'Base Tier';
    let emblem = '👤';

    if (tier === 'citizen_circle') {
        percentage = 75;
        color = '#10b981';
        label = 'Citizen Circle';
        subLabel = 'Phone Verified';
        emblem = '🛡️';
    } else if (tier === 'witness_circle') {
        percentage = Math.min(100, Math.floor((reputation / 300) * 100));
        color = '#8b5cf6';
        label = 'Witness Circle';
        subLabel = 'ZK Verified';
        emblem = '🔐';
    } else {
        percentage = Math.min(45, Math.floor((reputation / 100) * 100));
    }

    return `
        <div class="relative w-12 h-12 flex items-center justify-center flex-shrink-0">
            <svg class="w-12 h-12 -rotate-90 transition-all" viewBox="0 0 42 42">
                <circle cx="21" cy="21" r="15" fill="none" stroke="#1f2937" stroke-width="5"></circle>
                <circle
                    cx="21" cy="21" r="15"
                    fill="none"
                    stroke="${color}"
                    stroke-width="5"
                    stroke-dasharray="${percentage * 0.94} 94"
                    stroke-linecap="round"
                    class="transition-all duration-700"
                ></circle>
            </svg>
            <div class="absolute text-center">
                <div class="text-2xl leading-none">${emblem}</div>
            </div>
        </div>
    `;
}

export function updateTierBadge(containerId, tier, reputation) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.style.transition = "opacity 0.4s ease";
    container.style.opacity = 0;

    setTimeout(() => {
        container.innerHTML = renderTierCircle(tier, reputation);
        container.style.opacity = 1;
    }, 100);
}
