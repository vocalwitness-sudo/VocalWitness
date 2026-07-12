// Add this logic to a new file js/ui-components.js
export function renderTierCircle(position) {
  return `
    <div class="tier-circle-container flex flex-col items-center justify-center p-2 rounded-full border-2 border-emerald-500 shadow-lg bg-zinc-900 w-24 h-24">
      <span class="text-3xl">${position.emblem}</span>
      <span class="text-[10px] text-white font-bold uppercase">${position.name}</span>
    </div>
  `;
}
