/**
 * Pure shaping/validation of a deck's card list against the format's ZoneDefs
 * (P1.1). Game-ignorant by construction: everything comes off the adapter's
 * FormatDef. Full rules validation (singleton, color identity, bans) is the
 * adapter's `validate` and lands in the editor in P1.4 — this module only
 * enforces what must hold for the ROWS to make sense: known zones, no
 * duplicate (zone, card) keys, zone card-count maximums.
 */
import type { FormatDef } from "@/lib/games/types";

export interface DeckCardInput {
  cardId: string;
  zone: string;
  qty: number;
  tags: string[];
  printingId?: string;
}

/** Structural problems that make the list unstorable; [] = ok. */
export function cardListIssues(entries: DeckCardInput[], format: FormatDef): string[] {
  const issues: string[] = [];
  const zoneById = new Map(format.zones.map((z) => [z.id, z]));

  const seen = new Set<string>();
  const zoneCounts = new Map<string, number>();
  for (const entry of entries) {
    if (!zoneById.has(entry.zone)) {
      issues.push(`Unknown zone "${entry.zone}" for format "${format.code}"`);
      continue;
    }
    const key = `${entry.zone}\u0000${entry.cardId}`;
    if (seen.has(key)) {
      issues.push(`Duplicate entry for card ${entry.cardId} in zone "${entry.zone}"`);
    }
    seen.add(key);
    zoneCounts.set(entry.zone, (zoneCounts.get(entry.zone) ?? 0) + entry.qty);
  }

  // Only maximums: in-progress decks are legitimately under zone/deck minimums.
  for (const zone of format.zones) {
    const count = zoneCounts.get(zone.id) ?? 0;
    if (zone.max !== null && count > zone.max) {
      issues.push(`Zone "${zone.id}" holds ${count} cards; the maximum is ${zone.max}`);
    }
  }
  return issues;
}

/**
 * The token rule (DECK-TOKENS): a zone that holds tokens (`ZoneDef.holds`)
 * takes only token-catalog objects, and every other zone takes none — so a
 * token never enters the 100 and the Tokens zone never becomes a maybeboard.
 * Game-ignorant like cardListIssues: `isToken` says what each card is, read
 * by the caller from the rows it already holds; unknown zones are
 * cardListIssues' to report. [] = ok.
 */
export function tokenZoneIssues(
  entries: readonly DeckCardInput[],
  format: FormatDef,
  isToken: (cardId: string) => boolean,
): string[] {
  const holds = new Map(format.zones.map((z) => [z.id, z.holds ?? "cards"]));
  const issues: string[] = [];
  for (const entry of entries) {
    const zoneHolds = holds.get(entry.zone);
    if (zoneHolds === undefined) continue;
    const token = isToken(entry.cardId);
    if (zoneHolds === "tokens" && !token) {
      issues.push(`Card ${entry.cardId} is not a token; zone "${entry.zone}" holds tokens only`);
    } else if (zoneHolds === "cards" && token) {
      issues.push(`Card ${entry.cardId} is a token, which zone "${entry.zone}" can't hold`);
    }
  }
  return issues;
}

/**
 * The decks-table denorms driven by the command zone: leader_ids (order
 * preserved — partners) and deck ci_mask = OR of the leaders' color identity.
 */
export function leaderDenorm(
  entries: DeckCardInput[],
  format: FormatDef,
  ciMaskByCard: ReadonlyMap<string, number>,
): { leaderIds: string[]; ciMask: number } {
  const leaderZones = new Set(format.zones.filter((z) => z.isLeaderZone).map((z) => z.id));
  const leaderIds = entries.filter((e) => leaderZones.has(e.zone)).map((e) => e.cardId);
  const ciMask = leaderIds.reduce((mask, id) => mask | (ciMaskByCard.get(id) ?? 0), 0);
  return { leaderIds, ciMask };
}
