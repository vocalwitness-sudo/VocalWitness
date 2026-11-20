// js/empty-square.js
export function renderEmptySquare(container) {
  if (!container) return;

  container.innerHTML = `
    <div id="vw-empty-square" class="flex flex-col items-center justify-center text-center px-6 py-14 max-w-md mx-auto">
      <div class="w-20 h-20 rounded-3xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-4xl mb-5 shadow-lg shadow-emerald-500/10" aria-hidden="true">
        🛡️
      </div>
      <h2 class="text-xl font-bold text-white tracking-tight mb-2">
        The Square is waiting for the first sealed report
      </h2>
      <p class="text-sm text-zinc-400 leading-relaxed mb-6">
        Be among the first citizens to publish what you saw.
        Media is hashed on your device. Once sealed, it stays verifiable.
      </p>
      <button type="button"
              id="vw-empty-speak-btn"
              class="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm shadow-lg shadow-emerald-500/25 transition active:scale-95">
        <span aria-hidden="true">🎙️</span> Speak as a Citizen
      </button>
      <p class="mt-4 text-[11px] text-zinc-500">
        Free · Privacy Shield available · No ads on testimony
      </p>
    </div>
  `;

  const btn = document.getElementById('vw-empty-speak-btn');
  if (btn && !btn.dataset.wired) {
    btn.dataset.wired = 'true';
    btn.addEventListener('click', () => {
      if (typeof window.switchTab === 'function') window.switchTab('square');
      const ta =
        document.getElementById('mainInput') ||
        document.querySelector('#composer textarea, #post-content, textarea[name="content"]');
      if (ta) {
        ta.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => ta.focus(), 300);
      }
    });
  }
}
