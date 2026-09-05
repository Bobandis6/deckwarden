/**
 * OP color display helpers (P4.4). The schema stores OP colors on the shared
 * mask bits (punk-map.OPTCG_COLOR_BIT: Red 8, Green 16, Blue 2, Black 4,
 * Yellow 1, Purple 32) — but the shared pip renderer speaks MTG letters, and
 * "W" on a Yellow leader would be wrong. Display order follows Bandai's
 * conventional Red/Green/Blue/Purple/Black/Yellow.
 *
 * Pure module (no IO), importable from client components and OP-specific
 * pages alike — the same precedent as MTG pages importing topdeck-map.
 */
import { OPTCG_COLOR_BIT } from "./punk-map";

export interface OptcgColorDef {
  name: "Red" | "Green" | "Blue" | "Purple" | "Black" | "Yellow";
  bit: number;
  /** The shared-mask letter (translate.ts COLOR_BIT) — the colorset param grammar. */
  maskLetter: "R" | "G" | "U" | "C" | "B" | "W";
  /** Hex used for inline color chips (Bandai's card frame palette, approximated). */
  hex: string;
}

export const OPTCG_COLORS: readonly OptcgColorDef[] = [
  { name: "Red", bit: OPTCG_COLOR_BIT.Red, maskLetter: "R", hex: "#d32f2f" },
  { name: "Green", bit: OPTCG_COLOR_BIT.Green, maskLetter: "G", hex: "#2e7d32" },
  { name: "Blue", bit: OPTCG_COLOR_BIT.Blue, maskLetter: "U", hex: "#1565c0" },
  { name: "Purple", bit: OPTCG_COLOR_BIT.Purple, maskLetter: "C", hex: "#6a1b9a" },
  { name: "Black", bit: OPTCG_COLOR_BIT.Black, maskLetter: "B", hex: "#37474f" },
  { name: "Yellow", bit: OPTCG_COLOR_BIT.Yellow, maskLetter: "W", hex: "#f9a825" },
];

/** Mask → OP color names in display order ("Red/Green"). Empty array for mask 0. */
export function maskToOptcgColorNames(mask: number): string[] {
  return OPTCG_COLORS.filter((c) => (mask & c.bit) !== 0).map((c) => c.name);
}

/** Mask → colorset-grammar letters ("RU") in OP display order, for /cards links. */
export function maskToOptcgLetters(mask: number): string {
  return OPTCG_COLORS.filter((c) => (mask & c.bit) !== 0)
    .map((c) => c.maskLetter)
    .join("");
}
