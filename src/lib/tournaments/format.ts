/**
 * Display helpers for the tournament surfaces (W10) — the /c/ and /l/ hub
 * shelves grew these locally first (P3.5/P4.5); the /tournaments pages share
 * one copy instead of a third and fourth mirror. X4a's set places ("the
 * 71st expansion set") and set release dates read them too.
 */

/** 1 → "1st", 12 → "12th", 102 → "102nd", 113 → "113th". */
export function ordinal(n: number): string {
  const rem10 = n % 10;
  const rem100 = n % 100;
  if (rem10 === 1 && rem100 !== 11) return `${n}st`;
  if (rem10 === 2 && rem100 !== 12) return `${n}nd`;
  if (rem10 === 3 && rem100 !== 13) return `${n}rd`;
  return `${n}th`;
}

/** "2026-08-30" → "Aug 30, 2026", pinned to UTC so the date column never shifts a day. */
export function eventDateLabel(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}
