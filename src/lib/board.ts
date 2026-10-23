// Small helpers for the deal board cards.

// Whole days between an ISO timestamp (or YYYY-MM-DD) and now; never negative.
export function daysSince(iso: string | null | undefined, now = Date.now()): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((now - t) / 864e5));
}

export const ageLabel = (days: number) => (days < 1 ? "today" : `${days}d`);

// Open deals get nudged when they sit too long in a stage.
export const staleness = (days: number): "fresh" | "slow" | "stale" =>
  days >= 14 ? "stale" : days >= 7 ? "slow" : "fresh";

export function initialsOf(name: string | null | undefined): string {
  const w = (name ?? "").split(/\s+/).filter(Boolean);
  if (!w.length) return "?";
  return (w.length > 1 ? w[0]![0]! + w[1]![0]! : w[0]!.slice(0, 2)).toUpperCase();
}

// Stable colour per customer so the same person always gets the same avatar.
export function hueOf(s: string | null | undefined): number {
  let h = 0;
  for (const c of s ?? "") h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}
