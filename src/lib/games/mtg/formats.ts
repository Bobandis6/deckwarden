import type { FormatDef } from "../types";

/**
 * Commander: 100 cards total INCLUDING the command zone; 1 commander, or 2
 * with a legal pairing (Partner / Partner with / Friends forever / Background /
 * Doctor's companion — checked in validate.ts, not schema-tized).
 *
 * main.defaultCopyLimit is null = singleton with the adapter's exemption logic
 * (basics, "a deck can have any number…" cards).
 */
export const COMMANDER: FormatDef = {
  code: "commander",
  label: "Commander",
  zones: [
    {
      id: "commander",
      label: "Commander",
      min: 1,
      max: 2,
      countsTowardSize: true,
      defaultCopyLimit: 1,
      isLeaderZone: true,
    },
    {
      id: "main",
      label: "Main deck",
      min: 0,
      max: null,
      countsTowardSize: true,
      defaultCopyLimit: null,
    },
  ],
  deckSize: { min: 100, max: 100 },
};

export const MTG_FORMATS: FormatDef[] = [COMMANDER];

export function mtgFormat(code: string): FormatDef | undefined {
  return MTG_FORMATS.find((f) => f.code === code);
}
