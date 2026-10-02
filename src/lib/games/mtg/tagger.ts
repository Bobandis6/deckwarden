/**
 * Scryfall Tagger flags for the bracket read (Y3a, WAVE4 D3) — pure, no IO.
 *
 * scripts/ingest/scryfall.ts streams Scryfall's `oracle_tags` bulk (the
 * community Tagger project — Commander Spellbook's own source for these
 * flags) into a TagIndex before staging, then resolveTagger() says which
 * cards carry `attrs.mld` ("clear" | "edge") and `attrs.extra_turn`.
 *
 * - A pinned tag flags its own taggings plus every descendant tag's
 *   (Spellbook's roll-up rule).
 * - data/mtg/tagger-overrides.json is the human layer: each flag's pinned tag
 *   (by UUID — slugs get renamed), a kill-switch, the reviewed clear / edge
 *   split of the land-denial list, and disabled cards.
 * - A failing source never lowers the read: when the bulk can't be fetched or
 *   parsed, or a pinned tag is missing from it or flags no card, that flag
 *   keeps the cards already stored ("kept"), split again by today's overrides,
 *   and its stale_since says since when.
 */
import type { MtgAttrs } from "./attrs";

export const TAGGER_FLAGS = ["mld", "extra_turn"] as const;
export type TaggerFlag = (typeof TAGGER_FLAGS)[number];

/** One card's Tagger flags as written to attrs — sparse. */
export type TaggerCardFlags = Pick<MtgAttrs, "mld" | "extra_turn">;

// --- The overrides file ----------------------------------------------------------

export interface TaggerFlagOverrides {
  /** The pinned Tagger tag: the UUID is its identity, the slug is for people. */
  tag: { id: string; slug: string };
  /** The kill-switch: false writes this flag for no card, and the read can't check it. */
  enabled: boolean;
  /**
   * mld only — the reviewed split of the tag's list, oracle id → note. A
   * tagged card in neither list reads "edge" (your call) until it's reviewed.
   */
  clear: Record<string, string>;
  edge: Record<string, string>;
  /** Oracle ids this flag is never written for, → why. */
  disabledCards: Record<string, string>;
}

export interface TaggerOverrides {
  reviewed: string;
  flags: Record<TaggerFlag, TaggerFlagOverrides>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const problem = (msg: string) => new Error(`tagger overrides: ${msg}`);

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function idNotes(raw: unknown, at: string): Record<string, string> {
  if (raw === undefined) return {};
  if (!isObject(raw)) throw problem(`${at} must map oracle ids to notes`);
  for (const [id, note] of Object.entries(raw)) {
    if (!UUID.test(id)) throw problem(`${at}: ${JSON.stringify(id)} is not an oracle id`);
    if (typeof note !== "string" || !note.trim())
      throw problem(`${at}["${id}"]: the note must name the card`);
  }
  return raw as Record<string, string>;
}

/** Parse + validate the hand-edited file. Throws with a pointed message — before any write. */
export function parseTaggerOverrides(json: unknown): TaggerOverrides {
  if (!isObject(json)) throw problem("not a JSON object");
  if (typeof json.reviewed !== "string" || !ISO_DATE.test(json.reviewed))
    throw problem("reviewed must be YYYY-MM-DD");
  if (!isObject(json.flags)) throw problem("flags must be an object");
  for (const name of Object.keys(json.flags)) {
    if (!(TAGGER_FLAGS as readonly string[]).includes(name))
      throw problem(`unknown flag ${JSON.stringify(name)} (known: ${TAGGER_FLAGS.join(", ")})`);
  }
  const pinned = new Set<string>();
  const flags = {} as Record<TaggerFlag, TaggerFlagOverrides>;
  for (const name of TAGGER_FLAGS) {
    const at = `flags.${name}`;
    const f = json.flags[name];
    if (!isObject(f)) throw problem(`${at} is missing`);
    const tag = f.tag;
    if (!isObject(tag) || typeof tag.id !== "string" || !UUID.test(tag.id))
      throw problem(`${at}.tag.id must be the Tagger tag's UUID`);
    if (typeof tag.slug !== "string" || !tag.slug) throw problem(`${at}.tag.slug is missing`);
    if (pinned.has(tag.id)) throw problem(`${at}.tag.id is pinned by another flag`);
    pinned.add(tag.id);
    if (typeof f.enabled !== "boolean") throw problem(`${at}.enabled must be true or false`);
    if (name !== "mld" && (f.clear !== undefined || f.edge !== undefined))
      throw problem(`${at}: only mld has a clear / edge split`);
    const clear = idNotes(f.clear, `${at}.clear`);
    const edge = idNotes(f.edge, `${at}.edge`);
    const disabledCards = idNotes(f.disabledCards, `${at}.disabledCards`);
    for (const id of Object.keys(edge)) {
      if (Object.hasOwn(clear, id)) throw problem(`${at}: ${id} is both clear and edge`);
    }
    for (const id of Object.keys(disabledCards)) {
      if (Object.hasOwn(clear, id) || Object.hasOwn(edge, id))
        throw problem(`${at}: ${id} is disabled and also split — pick one`);
    }
    flags[name] = {
      tag: { id: tag.id, slug: tag.slug },
      enabled: f.enabled,
      clear,
      edge,
      disabledCards,
    };
  }
  return { reviewed: json.reviewed, flags };
}

/** Every oracle id the file names — each must be a card the run stages (the unknown-id check). */
export function overrideOracleIds(overrides: TaggerOverrides): string[] {
  const ids = new Set<string>();
  for (const name of TAGGER_FLAGS) {
    const f = overrides.flags[name];
    for (const list of [f.clear, f.edge, f.disabledCards]) {
      for (const id of Object.keys(list)) ids.add(id);
    }
  }
  return [...ids];
}

// --- The oracle_tags bulk ---------------------------------------------------------

/** What the run keeps of one Tagger tag: its child tags and its tagged oracle ids. */
export type TagIndex = Map<string, { childIds: string[]; oracleIds: string[] }>;

/** One JSONL line of the bulk into the index. Throws on a malformed line (the caller keeps the stored flags). */
export function indexTagLine(index: TagIndex, line: string): void {
  const tag: unknown = JSON.parse(line);
  if (!isObject(tag) || typeof tag.id !== "string")
    throw new Error("oracle_tags: a tag without an id");
  const childIds = Array.isArray(tag.child_ids)
    ? tag.child_ids.filter((c): c is string => typeof c === "string")
    : [];
  const oracleIds: string[] = [];
  if (Array.isArray(tag.taggings)) {
    for (const t of tag.taggings) {
      if (isObject(t) && typeof t.oracle_id === "string") oracleIds.push(t.oracle_id);
    }
  }
  index.set(tag.id, { childIds, oracleIds });
}

/** The tag's oracle ids plus every descendant's; null when the bulk lacks the tag. Cycle-safe. */
export function rollUp(index: TagIndex, rootId: string): Set<string> | null {
  if (!index.has(rootId)) return null;
  const out = new Set<string>();
  const seen = new Set([rootId]);
  const queue = [rootId];
  while (queue.length) {
    const node = index.get(queue.pop()!);
    if (!node) continue; // a child id this bulk doesn't carry
    for (const id of node.oracleIds) out.add(id);
    for (const child of node.childIds) {
      if (!seen.has(child)) {
        seen.add(child);
        queue.push(child);
      }
    }
  }
  return out;
}

// --- Resolution ------------------------------------------------------------------

/** fresh = read tonight; kept = the stored cards kept (the read failed); disabled = switched off. */
export type TaggerFlagStatus = "fresh" | "kept" | "disabled";

export interface TaggerInputs {
  overrides: TaggerOverrides;
  /** The parsed bulk, or null when it couldn't be fetched or parsed. */
  index: TagIndex | null;
  /** Oracle ids carrying each flag in card_identities now — the fallback. */
  stored: Record<TaggerFlag, ReadonlySet<string>>;
  /** stale_since from the latest successful run's stats.tagger, when it has one. */
  previousStaleSince: Partial<Record<TaggerFlag, string | null>> | null;
  /** This run's start, ISO. */
  nowIso: string;
}

export interface TaggerResolution {
  status: Record<TaggerFlag, TaggerFlagStatus>;
  /** null when fresh or disabled; else when the flag stopped refreshing (carried run to run). */
  staleSince: Record<TaggerFlag, string | null>;
  /** Per flag, the oracle ids before overrides: the tag's roll-up, or the stored ones when kept. */
  tagged: Record<TaggerFlag, Set<string>>;
  /** oracle id → the flags to write, after overrides. */
  cards: Map<string, TaggerCardFlags>;
  /** Why a flag was kept, when the bulk itself was read. */
  notes: string[];
}

export function resolveTagger(input: TaggerInputs): TaggerResolution {
  const { overrides, index } = input;
  const status = {} as Record<TaggerFlag, TaggerFlagStatus>;
  const staleSince = {} as Record<TaggerFlag, string | null>;
  const tagged = {} as Record<TaggerFlag, Set<string>>;
  const notes: string[] = [];
  for (const flag of TAGGER_FLAGS) {
    const o = overrides.flags[flag];
    if (!o.enabled) {
      status[flag] = "disabled";
      staleSince[flag] = null;
      tagged[flag] = new Set();
      continue;
    }
    const fresh = index ? rollUp(index, o.tag.id) : null;
    if (fresh && fresh.size > 0) {
      status[flag] = "fresh";
      staleSince[flag] = null;
      tagged[flag] = fresh;
      continue;
    }
    if (index) {
      notes.push(
        fresh
          ? `${flag}: the pinned tag ${o.tag.slug} (${o.tag.id}) flags no card`
          : `${flag}: the pinned tag ${o.tag.slug} (${o.tag.id}) is not in the bulk`,
      );
    }
    status[flag] = "kept";
    staleSince[flag] = input.previousStaleSince?.[flag] ?? input.nowIso;
    tagged[flag] = new Set(input.stored[flag]);
  }

  const cards = new Map<string, TaggerCardFlags>();
  for (const flag of TAGGER_FLAGS) {
    const o = overrides.flags[flag];
    for (const id of tagged[flag]) {
      if (Object.hasOwn(o.disabledCards, id)) continue;
      const entry = cards.get(id) ?? {};
      if (flag === "mld") entry.mld = Object.hasOwn(o.clear, id) ? "clear" : "edge";
      else entry.extra_turn = true;
      cards.set(id, entry);
    }
  }
  return { status, staleSince, tagged, cards, notes };
}

/** Tagged mass-land-denial cards neither list names — they read "edge" until reviewed. */
export function isUnreviewedMld(overrides: TaggerOverrides, oracleId: string): boolean {
  const o = overrides.flags.mld;
  return !Object.hasOwn(o.clear, oracleId) && !Object.hasOwn(o.edge, oracleId);
}

// --- Stats -----------------------------------------------------------------------

export interface TaggerFlagCounts {
  /** Distinct oracle ids tagged (rolled up), or stored when kept. */
  tagged: number;
  /** …of those, identities this run staged. */
  matched: number;
  /** …of those, written to attrs (matched minus disabled cards). */
  flagged: number;
  /** Written now but not stored before the run, and the reverse. */
  added: number;
  removed: number;
  /** Ids the file lists for this flag that the fresh tag no longer flags; null unless fresh. */
  listed_untagged: number | null;
  /** mld only: the clear / edge split of `flagged`; `unreviewed` is the part of edge no list names. */
  clear?: number;
  edge?: number;
  unreviewed?: number;
}

/** ingest_runs.stats.tagger — Y3b's freshness loader reads status and stale_since. */
export interface TaggerStats {
  /** The oracle_tags bulk's updated_at; null when it wasn't read. */
  bulk_updated_at: string | null;
  tag_ids: Record<TaggerFlag, string>;
  status: Record<TaggerFlag, TaggerFlagStatus>;
  stale_since: Record<TaggerFlag, string | null>;
  counts: Record<TaggerFlag, TaggerFlagCounts>;
  /** Why the read failed or a flag was kept; null when every enabled flag is fresh. */
  error: string | null;
}

export function taggerCounts(
  res: TaggerResolution,
  overrides: TaggerOverrides,
  stored: Record<TaggerFlag, ReadonlySet<string>>,
  staged: ReadonlySet<string>,
): Record<TaggerFlag, TaggerFlagCounts> {
  const out = {} as Record<TaggerFlag, TaggerFlagCounts>;
  for (const flag of TAGGER_FLAGS) {
    const o = overrides.flags[flag];
    const written = new Set<string>();
    for (const [id, flags] of res.cards) {
      if (flags[flag] !== undefined && staged.has(id)) written.add(id);
    }
    const listed = [
      ...Object.keys(o.clear),
      ...Object.keys(o.edge),
      ...Object.keys(o.disabledCards),
    ];
    const counts: TaggerFlagCounts = {
      tagged: res.tagged[flag].size,
      matched: [...res.tagged[flag]].filter((id) => staged.has(id)).length,
      flagged: written.size,
      added: [...written].filter((id) => !stored[flag].has(id)).length,
      removed: [...stored[flag]].filter((id) => !written.has(id)).length,
      listed_untagged:
        res.status[flag] === "fresh"
          ? listed.filter((id) => !res.tagged[flag].has(id)).length
          : null,
    };
    if (flag === "mld") {
      const values = [...written].map((id) => res.cards.get(id)!.mld);
      counts.clear = values.filter((v) => v === "clear").length;
      counts.edge = values.filter((v) => v === "edge").length;
      counts.unreviewed = [...written].filter((id) => isUnreviewedMld(overrides, id)).length;
    }
    out[flag] = counts;
  }
  return out;
}
