/**
 * Schema-level color-mask helpers (P2.4). The bit assignment W1 U2 B4 R8 G16
 * C32 is a cross-game schema fact (schema.ts, types.ts) — other games reuse
 * the bits — so mask↔letter translation is core code, usable by hub pages
 * and filters without importing any game module. Adapters keep their own
 * copies for ingest mapping; this is the UI/query side.
 */

export const COLOR_BIT: Record<string, number> = { W: 1, U: 2, B: 4, R: 8, G: 16, C: 32 };

/** Canonical display order (WUBRG, then explicit colorless). */
export const COLOR_ORDER = ["W", "U", "B", "R", "G", "C"] as const;
export type ColorLetter = (typeof COLOR_ORDER)[number];

export function maskToLetters(mask: number): ColorLetter[] {
  return COLOR_ORDER.filter((c) => (mask & COLOR_BIT[c]) !== 0);
}

/** "wub", "WUB", "w,u b" → mask. Unknown characters are ignored. */
export function lettersToMask(letters: string): number {
  let mask = 0;
  for (const ch of letters.toUpperCase()) mask |= COLOR_BIT[ch] ?? 0;
  return mask;
}

/**
 * Color-identity pips in the adapters' shared pip markup (globals.css:
 * `<span class="pip pip-w">W</span>`; unmatched classes render the neutral
 * base style). Mask 0 — a colorless identity — renders a single C pip so the
 * identity is never invisible.
 */
export function ciPipsHtml(mask: number): string {
  const letters = maskToLetters(mask & ~COLOR_BIT.C);
  const shown: string[] = letters.length > 0 ? letters : ["C"];
  return shown.map((c) => `<span class="pip pip-${c.toLowerCase()}">${c}</span>`).join("");
}
