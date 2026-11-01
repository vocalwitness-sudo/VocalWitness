// js/badges.js

export const BADGE_DEFINITIONS = [
  { minRep: 0, title: "Citizen", emblem: "👤", badgeClass: "bg-zinc-800 text-zinc-300" },
  { minRep: 50, title: "Witness Lvl 1", emblem: "👁️", badgeClass: "bg-sky-500/20 text-sky-400 border border-sky-500/30" },
  { minRep: 150, title: "True Voice", emblem: "🗣️", badgeClass: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" },
  { minRep: 350, title: "Guardian", emblem: "🛡️", badgeClass: "bg-amber-500/20 text-amber-400 border border-amber-500/30" },
  { minRep: 750, title: "Master Steward", emblem: "⚖️", badgeClass: "bg-purple-500/20 text-purple-400 border border-purple-500/30" },
];

export function getUserBadge(reputation = 0) {
  let assigned = BADGE_DEFINITIONS[0];
  for (const def of BADGE_DEFINITIONS) {
    if (reputation >= def.minRep) assigned = def;
  }
  return assigned;
}

export function renderSupporterBadgeHTML(isSupporter = false) {
  if (!isSupporter) return "";
  return `
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold
                 bg-rose-500/15 text-rose-300 border border-rose-500/30"
          title="Voluntary supporter — does not affect trust or ranking">
      <span>♥</span>
      <span>Supporter</span>
    </span>
  `;
}

export function renderUserBadgeHTML(reputation = 0, isVerified = false, isSupporter = false) {
  const badge = getUserBadge(reputation);
  return `
    <span class="inline-flex items-center gap-1.5 flex-wrap">
      <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${badge.badgeClass}">
        <span>${badge.emblem}</span>
        <span>${badge.title}</span>
        ${isVerified ? `<span class="text-amber-400 ml-0.5" title="Verified">✓</span>` : ""}
      </span>
      ${renderSupporterBadgeHTML(isSupporter)}
    </span>
  `;
}

export function renderWitnessAuthorBadge(authorTier = "citizen", isVerified = false, isSupporter = false) {
  const trust =
    authorTier === "witness" ||
    authorTier === "witness_circle" ||
    authorTier === "steward" ||
    isVerified
      ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
           <span>🛡️ Verified Witness</span>
         </span>`
      : `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-400">
           <span>👤 Citizen</span>
         </span>`;

  return `
    <span class="inline-flex items-center gap-1.5 flex-wrap">
      ${trust}
      ${renderSupporterBadgeHTML(isSupporter)}
    </span>
  `;
}
