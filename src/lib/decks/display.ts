/**
 * Row-label helpers shared by the server-rendered deck lists (/account,
 * /u/[username], /f/[publicId]) so every list spells formats and dates the
 * same way. Extracted from the account page when P2.2 grew two more lists.
 */
import { findFormatById, gameCodeById } from "@/db/seed-data";
import { getAdapter } from "@/lib/games/registry";

/** Adapter label for a deck's format ("Commander"), falling back to the raw code. */
export function formatLabel(gameId: number, formatId: number): string {
  const game = gameCodeById(gameId);
  const code = findFormatById(formatId)?.code;
  if ((game !== "mtg" && game !== "optcg") || !code) return code ?? "";
  return getAdapter(game).formats.find((f) => f.code === code)?.label ?? code;
}

/** UTC-pinned like the share page (commit 4c90f67) — server tz must not leak in. */
export function updatedLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** UTC-pinned month + year, for profile "Joined" lines. */
export function joinedLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
}
