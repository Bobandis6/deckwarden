/**
 * Pure roll-up for the commander×card tournament aggregate (P3.8) — the
 * in-memory half of the pipeline that fills commander_card_stats /
 * commander_stats. IO (loading resolver maps, the upserts, the
 * cards_aggregated_at marking) lives in scripts/ingest/topdeck-aggregate.ts;
 * this module is unit-tested logic only.
 *
 * Resolution layering (measured against the 180-day raw corpus 2026-09-02):
 * a mainboard entry resolves by its Scryfall ORACLE id first (Topdeck's
 * deckObj values carry `{id, count}` where id = card_identities.external_key
 * — exact and authoritative), then by exact normalized full name, then by
 * exact normalized FACE name (Topdeck writes double-faced cards as one face:
 * "Shatterskull Smashing" is a back face, "Birgi, God of Storytelling" a
 * front). Never trgm — a fuzzy wrong-card match would silently poison the
 * shares — and whatever still misses is COUNTED as unresolved, never
 * guessed (the name-only measurement missed 2,247 of 1.99M entries, 0.11%).
 */

export interface ListCardMaps {
  /** card_identities.external_key (Scryfall oracle id) → identity id. */
  byExternalKey: ReadonlyMap<string, string>;
  /** Exact name_norm → identity id (full canonical names). */
  byNameNorm: ReadonlyMap<string, string>;
  /** Normalized face name → identity id (front AND back faces). */
  byFaceNorm: ReadonlyMap<string, string>;
}

/** One resolver over the three maps, in id → name → face precedence. */
export function makeListCardResolver(
  maps: ListCardMaps,
  normalize: (name: string) => string,
): (entry: { name: string; oracleId?: string }) => string | undefined {
  return (entry) => {
    if (entry.oracleId !== undefined) {
      const byId = maps.byExternalKey.get(entry.oracleId);
      if (byId !== undefined) return byId;
    }
    const norm = normalize(entry.name);
    return maps.byNameNorm.get(norm) ?? maps.byFaceNorm.get(norm);
  };
}

/** One kept standing's resolved list, tagged with its event's date. */
export interface DatedList {
  /** Sorted commander identity ids (the mapper sorts). */
  leaderIds: readonly string[];
  placement: number;
  cardIds: readonly string[];
  /** The event's start_date (ISO). */
  startDate: string;
}

export interface PairStatRow {
  leader_ids: string[];
  card_identity_id: string;
  lists: number;
  top4: number;
  first_seen: string;
  last_seen: string;
}

export interface CommanderStatRow {
  leader_ids: string[];
  lists: number;
  first_seen: string;
  last_seen: string;
}

/** Placements at or under this count into `top4`. */
export const TOP4_PLACEMENT = 4;

/**
 * Roll settled lists up per (exact commander set, card) — and the per-set
 * denominators — as INCREMENT rows: the upsert adds `lists`/`top4` to what
 * the table already holds and folds the date bounds with least/greatest, so
 * calling this over any batch of not-yet-aggregated tournaments composes.
 */
export function rollUpLists(lists: readonly DatedList[]): {
  pairs: PairStatRow[];
  commanders: CommanderStatRow[];
} {
  const pairs = new Map<string, PairStatRow>();
  const commanders = new Map<string, CommanderStatRow>();
  for (const list of lists) {
    const leaderKey = list.leaderIds.join(",");
    const isTop4 = list.placement <= TOP4_PLACEMENT;

    const cmd = commanders.get(leaderKey);
    if (cmd === undefined) {
      commanders.set(leaderKey, {
        leader_ids: [...list.leaderIds],
        lists: 1,
        first_seen: list.startDate,
        last_seen: list.startDate,
      });
    } else {
      cmd.lists++;
      if (list.startDate < cmd.first_seen) cmd.first_seen = list.startDate;
      if (list.startDate > cmd.last_seen) cmd.last_seen = list.startDate;
    }

    for (const cardId of list.cardIds) {
      const key = `${leaderKey}|${cardId}`;
      const pair = pairs.get(key);
      if (pair === undefined) {
        pairs.set(key, {
          leader_ids: [...list.leaderIds],
          card_identity_id: cardId,
          lists: 1,
          top4: isTop4 ? 1 : 0,
          first_seen: list.startDate,
          last_seen: list.startDate,
        });
      } else {
        pair.lists++;
        if (isTop4) pair.top4++;
        if (list.startDate < pair.first_seen) pair.first_seen = list.startDate;
        if (list.startDate > pair.last_seen) pair.last_seen = list.startDate;
      }
    }
  }
  return { pairs: [...pairs.values()], commanders: [...commanders.values()] };
}

/**
 * The settled cutoff for a run ending at `endMs`: events whose start_date is
 * STRICTLY older than TRAILING_REFETCH_DAYS ago never re-enter the nightly
 * fetch window (results settle late — the window's whole reason), so their
 * lists can be aggregated exactly once. Events at or after the cutoff wait;
 * the window formula (daysSinceLastSuccess + trailing days) guarantees every
 * event is still being fetched on the night it first counts as settled, even
 * after failed nights.
 */
export function settledCutoffIso(endMs: number, trailingRefetchDays: number): string {
  return new Date(endMs - trailingRefetchDays * 86_400_000).toISOString().slice(0, 10);
}
