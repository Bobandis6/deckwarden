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
 *
 * Y7a adds Swap Lab's roles (WAVE4 D8): the whitelist in ./roles.ts becomes
 * sparse `attrs.roles` the same way — the same index, the same roll-up (minus
 * each role's `except` tags), the same three outcomes per role, and a
 * per-role kill-switch in the file's sibling `roles` key. Roles are not
 * bracket flags: the read never sees them.
 */
import type { MtgAttrs } from "./attrs";
import { MTG_ROLE_KEYS, MTG_ROLES, type MtgRole, type MtgRoleKey } from "./roles";

export const TAGGER_FLAGS = ["mld", "extra_turn"] as const;
export type TaggerFlag = (typeof TAGGER_FLAGS)[number];

/** One card's Tagger facts as written to attrs — sparse; `roles` sorted (Y7a). */
export type TaggerCardFlags = Pick<MtgAttrs, "mld" | "extra_turn" | "roles">;

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

/** Swap Lab's per-role switch (Y7a). The tag itself is declared in ./roles.ts. */
export interface TaggerRoleOverrides {
  /** The kill-switch: false writes this role for no card, so no card matches on it. */
  enabled: boolean;
}

export interface TaggerOverrides {
  reviewed: string;
  flags: Record<TaggerFlag, TaggerFlagOverrides>;
  /** Every declared role, by key — the file lists them all, so each switch is visible. */
  roles: Record<MtgRoleKey, TaggerRoleOverrides>;
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
  return { reviewed: json.reviewed, flags, roles: parseRoleOverrides(json.roles) };
}

/** The sibling `roles` key (Y7a): exactly the declared roles, each with a boolean switch. */
function parseRoleOverrides(raw: unknown): Record<MtgRoleKey, TaggerRoleOverrides> {
  if (!isObject(raw)) throw problem("roles must be an object");
  for (const key of Object.keys(raw)) {
    if (!(MTG_ROLE_KEYS as readonly string[]).includes(key))
      throw problem(`unknown role ${JSON.stringify(key)} (known: ${MTG_ROLE_KEYS.join(", ")})`);
  }
  const roles = {} as Record<MtgRoleKey, TaggerRoleOverrides>;
  for (const key of MTG_ROLE_KEYS) {
    const r = raw[key];
    if (!isObject(r)) throw problem(`roles.${key} is missing`);
    if (typeof r.enabled !== "boolean") throw problem(`roles.${key}.enabled must be true or false`);
    roles[key] = { enabled: r.enabled };
  }
  return roles;
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

/**
 * A role's cards (Y7a): its tag's roll-up minus every `except` tag's roll-up.
 * null when the bulk lacks the tag or one of its except tags — the role then
 * keeps its stored cards, since a missing except would quietly widen it.
 */
export function rollUpRole(index: TagIndex, role: MtgRole): Set<string> | null {
  const cards = rollUp(index, role.tag.id);
  if (!cards) return null;
  for (const except of role.except ?? []) {
    const out = rollUp(index, except.id);
    if (!out) return null;
    for (const id of out) cards.delete(id);
  }
  return cards;
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
  /** Y7a: oracle ids carrying each role now — the per-role fallback. Absent = none stored. */
  storedRoles?: Partial<Record<MtgRoleKey, ReadonlySet<string>>>;
  /** Y7a: each role's stale_since from the latest successful run's stats.tagger.roles. */
  previousRoleStaleSince?: Partial<Record<MtgRoleKey, string | null>> | null;
}

/** The roles' half of a resolution (Y7a) — the flags' three outcomes, per role. */
export interface TaggerRoleResolution {
  status: Record<MtgRoleKey, TaggerFlagStatus>;
  staleSince: Record<MtgRoleKey, string | null>;
  /** Per role, the oracle ids: the roll-up, or the stored ones when kept; empty when disabled. */
  tagged: Record<MtgRoleKey, Set<string>>;
  /** Why a role was kept, when the bulk itself was read. */
  notes: string[];
}

export interface TaggerResolution {
  status: Record<TaggerFlag, TaggerFlagStatus>;
  /** null when fresh or disabled; else when the flag stopped refreshing (carried run to run). */
  staleSince: Record<TaggerFlag, string | null>;
  /** Per flag, the oracle ids before overrides: the tag's roll-up, or the stored ones when kept. */
  tagged: Record<TaggerFlag, Set<string>>;
  /** oracle id → the flags and roles to write, after overrides. */
  cards: Map<string, TaggerCardFlags>;
  /** Why a flag was kept, when the bulk itself was read. */
  notes: string[];
  roles: TaggerRoleResolution;
}

function resolveRoles(input: TaggerInputs): TaggerRoleResolution {
  const { overrides, index } = input;
  const status = {} as Record<MtgRoleKey, TaggerFlagStatus>;
  const staleSince = {} as Record<MtgRoleKey, string | null>;
  const tagged = {} as Record<MtgRoleKey, Set<string>>;
  const notes: string[] = [];
  for (const role of MTG_ROLES) {
    const key = role.key;
    if (!overrides.roles[key].enabled) {
      status[key] = "disabled";
      staleSince[key] = null;
      tagged[key] = new Set();
      continue;
    }
    const fresh = index ? rollUpRole(index, role) : null;
    if (fresh && fresh.size > 0) {
      status[key] = "fresh";
      staleSince[key] = null;
      tagged[key] = fresh;
      continue;
    }
    if (index) {
      notes.push(
        fresh
          ? `role ${key}: the pinned tag ${role.tag.slug} (${role.tag.id}) tags no card`
          : `role ${key}: the pinned tag ${role.tag.slug} or one of its except tags is not in the bulk`,
      );
    }
    status[key] = "kept";
    staleSince[key] = input.previousRoleStaleSince?.[key] ?? input.nowIso;
    tagged[key] = new Set(input.storedRoles?.[key]);
  }
  return { status, staleSince, tagged, notes };
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
  // Roles (Y7a): each card's keys, sorted, so a night with the same tags
  // writes the same array and the merge's tuple compare leaves the row alone.
  const roles = resolveRoles(input);
  const roleKeys = new Map<string, MtgRoleKey[]>();
  for (const key of MTG_ROLE_KEYS) {
    for (const id of roles.tagged[key]) {
      const list = roleKeys.get(id) ?? [];
      list.push(key);
      roleKeys.set(id, list);
    }
  }
  for (const [id, keys] of roleKeys) {
    cards.set(id, { ...cards.get(id), roles: keys.sort() });
  }
  return { status, staleSince, tagged, cards, notes, roles };
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

/** Per role (Y7a): what the roll-up held, what this run staged, wrote and changed. */
export interface TaggerRoleCounts {
  /** Distinct oracle ids the roll-up held (or the stored ones, when kept). */
  tagged: number;
  /** …of those, identities this run staged — every one is written (no per-card review yet). */
  written: number;
  added: number;
  removed: number;
}

/** ingest_runs.stats.tagger.roles (Y7a) — the flags' fields, per role, beside them. */
export interface TaggerRoleStats {
  tag_ids: Record<MtgRoleKey, string>;
  status: Record<MtgRoleKey, TaggerFlagStatus>;
  stale_since: Record<MtgRoleKey, string | null>;
  counts: Record<MtgRoleKey, TaggerRoleCounts>;
  /** Identities carrying at least one role after the run. */
  cards: number;
  /** Why a role was kept; null when every enabled role is fresh. */
  error: string | null;
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
  /** Swap Lab's roles (Y7a) — a sibling block, so the bracket freshness reader never sees them. */
  roles?: TaggerRoleStats;
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

/** Per-role counts (Y7a), the flags' arithmetic: staged identities only. */
export function taggerRoleStats(
  res: TaggerResolution,
  storedRoles: Partial<Record<MtgRoleKey, ReadonlySet<string>>>,
  staged: ReadonlySet<string>,
): TaggerRoleStats {
  const counts = {} as Record<MtgRoleKey, TaggerRoleCounts>;
  const tagIds = {} as Record<MtgRoleKey, string>;
  for (const role of MTG_ROLES) {
    const key = role.key;
    tagIds[key] = role.tag.id;
    const stored = storedRoles[key] ?? new Set<string>();
    const written = new Set([...res.roles.tagged[key]].filter((id) => staged.has(id)));
    counts[key] = {
      tagged: res.roles.tagged[key].size,
      written: written.size,
      added: [...written].filter((id) => !stored.has(id)).length,
      removed: [...stored].filter((id) => !written.has(id)).length,
    };
  }
  let cards = 0;
  for (const [id, facts] of res.cards) if (facts.roles?.length && staged.has(id)) cards++;
  return {
    tag_ids: tagIds,
    status: res.roles.status,
    stale_since: res.roles.staleSince,
    counts,
    cards,
    error: res.roles.notes.join("; ") || null,
  };
}
