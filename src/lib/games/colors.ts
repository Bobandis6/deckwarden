/**
 * Schema-level color-mask helpers (P2.4). The bit assignment W1 U2 B4 R8 G16
 * C32 is a cross-game schema fact (schema.ts, types.ts) — other games reuse
 * the bits — so mask↔letter translation is core code, usable by hub pages
 * and filters without importing any game module. This is the ONE table (S8,
 * SECURITY-AUDIT-report.md I3): the search translator, the Scryfall mapper
 * and the Magic analyzer read it from here, where each once kept a copy.
 * Two letter→mask readings are both load-bearing and both live here:
 * `lettersToMask` ignores what it does not know (a hub's `?colors=` query, a
 * precon filter), `strictLettersToMask` refuses it (the search grammar warns
 * on `within:WUX` rather than filtering by WU).
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

/** "wub" → mask, or null when any character is not a color letter (the search grammar's reading). */
export function strictLettersToMask(letters: string): number | null {
  let mask = 0;
  for (const ch of letters.toUpperCase()) {
    const bit = COLOR_BIT[ch];
    if (!bit) return null;
    mask |= bit;
  }
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
