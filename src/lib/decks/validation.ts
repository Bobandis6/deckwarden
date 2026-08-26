/**
 * Pure glue between deck entries and the adapter's `validate` (P1.4).
 *
 * Lives in the lib layer because the exact same shaping runs in three places:
 * the editor's live validation, the PUT save route's server-side revalidation,
 * and (later) P1.7's share pages. Game knowledge stays in the adapter — this
 * module only reshapes entries and indexes the adapter's ValidationIssues.
 */
import type {
  DeckEntry,
  DeckSnapshot,
  FormatDef,
  GameId,
  ValidationIssue,
} from "@/lib/games/types";

export interface SnapshotEntry {
  cardId: string;
  zone: string;
  qty: number;
  tags: string[];
  printingId?: string;
}

/**
 * Entries → DeckSnapshot. Every format zone is present in `zones` even when
 * empty — the adapter's zone-minimum checks (empty commander zone) only fire
 * for keys that exist. Zones the format doesn't define pass through so
 * ZONE_UNKNOWN fires too.
 */
export function toDeckSnapshot(
  gameId: GameId,
  format: FormatDef,
  entries: readonly SnapshotEntry[],
): DeckSnapshot {
  const zones: Record<string, DeckEntry[]> = {};
  for (const zone of format.zones) zones[zone.id] = [];
  for (const e of entries) {
    (zones[e.zone] ??= []).push({
      cardId: e.cardId,
      qty: e.qty,
      tags: e.tags,
      ...(e.printingId ? { printingId: e.printingId } : {}),
    });
  }
  return { gameId, formatCode: format.code, zones };
}

/** Worst severity per card id, for inline row/grid indicators. Errors win. */
export function issueSeverityByCard(
  issues: readonly ValidationIssue[],
): Map<string, "error" | "warning"> {
  const byCard = new Map<string, "error" | "warning">();
  for (const issue of issues) {
    for (const cardId of issue.cardIds ?? []) {
      if (issue.severity === "error" || !byCard.has(cardId)) byCard.set(cardId, issue.severity);
    }
  }
  return byCard;
}

export function countIssues(issues: readonly ValidationIssue[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errors++;
    else warnings++;
  }
  return { errors, warnings };
}
