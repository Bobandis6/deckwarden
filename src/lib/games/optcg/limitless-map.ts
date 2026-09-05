/**
 * Limitless tournament → row mapping for One Piece (P4.5).
 *
 * Pure functions consumed by scripts/ingest/limitless.ts — the topdeck-map.ts
 * division of labor (mapper pure + unit-tested, IO in the script). Input is
 * the documented Limitless API v2 shape (docs.limitlesstcg.com/developer),
 * every field treated as optional: a malformed event or standing skips WITH a
 * counted reason, never throws mid-ingest.
 *
 * Verified live 2026-09-05 against real OP events:
 * - standings rows: { name, country, decklist, deck, placing, player, record
 *   { wins, losses, ties }, drop }. Dropped players carry `placing: null`
 *   (skipped — they have no final standing). `deck` is the auto-assigned
 *   archetype: `{ id: "OP14-020", name }` when a decklist exists, `{}` when
 *   not — so it is NOT a usable leader fallback for no-decklist events.
 * - `decklist.leader` is a single { name, set, number } object; the card code
 *   is `${set}-${number}` ("OP14-020") and matches card_identities.external_key
 *   for game 2 exactly (15/15 distinct codes of a live 64-player event
 *   resolved, all leader candidates). Resolution is id-first by construction —
 *   stronger than MTG's name path; never fuzzy.
 * - `details.decklists: false` events return `decklist: null` on every row —
 *   assessTournament rejects them before the standings request is spent.
 * - `format` came back null on 374 of 400 sampled list rows, with EXTRA (11)
 *   and CUSTOM (15) labeled when set: organizers label non-Standard events
 *   and leave the default blank. Mapping decision: null/"STANDARD" →
 *   optcgStandard (our only OP format row), anything else skips counted.
 */

// --- Kept bounds (exported so the /l/ shelf can disclose exactly what's stored) ---

/**
 * Events smaller than this are not stored. Sampled 2026-09-05 over 143 days
 * of live OP events (400 rows): median 16 players, 180 kept at ≥16 (~9/week)
 * — real signal — while the 4–15 bracket is dominated by small webcam
 * weeklies. Matches MTG's Topdeck floor, so both shelves mean the same thing.
 */
export const MIN_EVENT_PLAYERS = 16;
/** Standings beyond this placement are not stored ("top-16"), the Topdeck bound. */
export const TOP_PLACEMENT = 16;
/**
 * Events stay in the nightly re-fetch window this long after their date
 * (placings finalize and decklists unlock late), then never re-enter it —
 * the settled-once discipline topdeck-aggregate.ts pioneered. Same value on
 * purpose; the future OP leader×card aggregate imports it from here.
 */
export const TRAILING_REFETCH_DAYS = 14;

const SMALLINT_MAX = 32767;
const MAX_NAME_LEN = 120;
const MAX_EVENT_NAME_LEN = 300;

const SITE_BASE = "https://play.limitlesstcg.com";

/** Public event permalink (302s to its details tab) — verified live 2026-09-05. */
export function limitlessEventUrl(externalKey: string): string {
  return `${SITE_BASE}/tournament/${encodeURIComponent(externalKey)}`;
}

/** Per-player public decklist page — verified live 2026-09-05 (200 on a real pair). */
export function limitlessDecklistUrl(externalKey: string, player: string): string {
  return `${SITE_BASE}/tournament/${encodeURIComponent(externalKey)}/player/${encodeURIComponent(player)}/decklist`;
}

// --- The slices of the API responses this job reads ---------------------------

/** GET /tournaments list row (also the shared fields of /details). */
export interface LimitlessListRow {
  id?: unknown;
  name?: unknown;
  /** ISO timestamp, e.g. "2026-09-04T21:25:00.000Z". */
  date?: unknown;
  format?: unknown;
  players?: unknown;
}

/** GET /tournaments/{id}/details — the fields the assess step reads. */
export interface LimitlessDetails extends LimitlessListRow {
  decklists?: unknown;
  isPublic?: unknown;
}

export interface LimitlessStanding {
  /** Public display name. */
  name?: unknown;
  /** Username — the decklist-page URL handle. */
  player?: unknown;
  /** null for dropped players. */
  placing?: unknown;
  /** { leader: {name,set,number}, character: [...], ... } or null. */
  decklist?: unknown;
  record?: unknown;
}

// --- Output rows (temp-table staging shape, tournament_standings columns) -----

export interface TournamentRow {
  external_key: string;
  name: string;
  /** ISO date (UTC). */
  start_date: string;
  player_count: number;
  /** Always null — Limitless reports phases, not a Topdeck-style cut size. */
  top_cut: number | null;
}

export interface StandingRow {
  external_key: string;
  placement: number;
  player_name: string | null;
  /** Exactly one resolved leader identity id (OP has no partners). */
  leader_ids: string[];
  decklist_url: string | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
}

// --- Skip taxonomies ----------------------------------------------------------

export type TournamentSkip =
  | "malformed"
  | "outside_window"
  | "too_small"
  | "unsupported_format"
  | "not_public"
  | "no_decklists"
  | "no_usable_standings";

export type StandingSkip =
  | "no_placing"
  | "beyond_top_placement"
  | "duplicate_placement"
  | "no_deck_data"
  | "malformed_leader"
  | "unresolved_leader";

/** Start bounds for a run's fetch window (epoch ms, inclusive) — topdeck-map's re-check move. */
export interface WindowBounds {
  minStartMs: number;
  maxStartMs: number;
}

// --- Helpers ------------------------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function textOrNull(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 && trimmed.length <= maxLen ? trimmed : null;
}

function smallintOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? Math.min(SMALLINT_MAX, Math.round(v))
    : null;
}

function dateMs(v: unknown): number | null {
  if (typeof v !== "string") return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
}

/** null/absent and "STANDARD" both mean Standard (see header); anything else is not ours. */
export function isStandardFormat(format: unknown): boolean {
  return format === null || format === undefined || format === "STANDARD";
}

/** `{set:"OP14", number:"020"}` → "OP14-020", matching external_key; null when unusable. */
export function leaderCodeFrom(decklist: unknown): string | null {
  if (!isRecord(decklist) || !isRecord(decklist.leader)) return null;
  const set = textOrNull(decklist.leader.set, 20);
  const number = textOrNull(decklist.leader.number, 20);
  if (!set || !number) return null;
  return `${set}-${number}`.toUpperCase();
}

// --- Assess (before the standings request is spent) ---------------------------

export type AssessResult = { ok: true } | { ok: false; skip: TournamentSkip };

/**
 * Whether an event's standings are worth fetching at all. Ordered so the
 * cheapest honest reason wins: malformed → window → format → visibility →
 * decklist availability. `isPublic: false` events are skipped entirely —
 * lean and respectful (every event sampled 2026-09-05 was public; the field
 * is the organizer's call and we honor it).
 */
export function assessTournament(details: LimitlessDetails, window?: WindowBounds): AssessResult {
  const externalKey = textOrNull(details.id, 200);
  const name = textOrNull(details.name, MAX_EVENT_NAME_LEN);
  const startMs = dateMs(details.date);
  if (!externalKey || !name || startMs === null) return { ok: false, skip: "malformed" };
  if (window && (startMs < window.minStartMs || startMs > window.maxStartMs)) {
    return { ok: false, skip: "outside_window" };
  }
  if (!isStandardFormat(details.format)) return { ok: false, skip: "unsupported_format" };
  if (details.isPublic === false) return { ok: false, skip: "not_public" };
  if (details.decklists !== true) return { ok: false, skip: "no_decklists" };
  return { ok: true };
}

// --- Mapping ------------------------------------------------------------------

export interface TournamentMapOk {
  ok: true;
  tournament: TournamentRow;
  standings: StandingRow[];
  standingSkips: Partial<Record<StandingSkip, number>>;
}

export type TournamentMapResult = TournamentMapOk | { ok: false; skip: TournamentSkip };

/**
 * Map one event's details + standings to rows. `resolveLeader` looks a card
 * code up in card_identities.external_key for game 2 (exact, leader
 * candidates only — the IO script passes a Map lookup). Call only after
 * assessTournament said ok; the malformed/too-small re-checks still hold on
 * their own (defensive, like topdeck-map).
 */
export function mapLimitlessTournament(
  details: LimitlessDetails,
  standings: unknown,
  resolveLeader: (code: string) => string | undefined,
): TournamentMapResult {
  const externalKey = textOrNull(details.id, 200);
  const name = textOrNull(details.name, MAX_EVENT_NAME_LEN);
  const startMs = dateMs(details.date);
  if (!externalKey || !name || startMs === null) return { ok: false, skip: "malformed" };

  const rawStandings: LimitlessStanding[] = Array.isArray(standings)
    ? (standings as LimitlessStanding[])
    : [];
  // Standings list everyone who played (verified: 64 rows on a 64-player
  // event, dropped players included) — their length IS the player count,
  // the topdeck-map precedent.
  const playerCount = rawStandings.length;
  if (playerCount < MIN_EVENT_PLAYERS) return { ok: false, skip: "too_small" };

  const standingSkips: Partial<Record<StandingSkip, number>> = {};
  const skip = (reason: StandingSkip) => {
    standingSkips[reason] = (standingSkips[reason] ?? 0) + 1;
  };

  const rows: StandingRow[] = [];
  const seenPlacements = new Set<number>();
  for (const s of rawStandings) {
    // No index fallback here, unlike topdeck-map: the array is NOT
    // placement-ordered (a dropped, placing-null player led a verified
    // response), so a synthesized placement would lie.
    const placing =
      typeof s.placing === "number" && Number.isInteger(s.placing) && s.placing >= 1
        ? s.placing
        : null;
    if (placing === null) {
      skip("no_placing");
      continue;
    }
    if (placing > TOP_PLACEMENT) {
      skip("beyond_top_placement");
      continue;
    }
    if (seenPlacements.has(placing)) {
      skip("duplicate_placement");
      continue;
    }

    if (s.decklist === null || s.decklist === undefined) {
      skip("no_deck_data");
      continue;
    }
    const code = leaderCodeFrom(s.decklist);
    if (code === null) {
      skip("malformed_leader");
      continue;
    }
    const leaderId = resolveLeader(code);
    if (!leaderId) {
      skip("unresolved_leader");
      continue;
    }

    seenPlacements.add(placing);
    const player = textOrNull(s.player, MAX_NAME_LEN);
    const record = isRecord(s.record) ? s.record : {};
    rows.push({
      external_key: externalKey,
      placement: placing,
      // Display name as published; the username is a fallback, not a guess.
      player_name: textOrNull(s.name, MAX_NAME_LEN) ?? player,
      leader_ids: [leaderId],
      decklist_url: player === null ? null : limitlessDecklistUrl(externalKey, player),
      wins: smallintOrNull(record.wins),
      draws: smallintOrNull(record.ties),
      losses: smallintOrNull(record.losses),
    });
  }

  // Nothing survived (event still running with placings unassigned, or no
  // resolvable lists) — a dead row no shelf can render. The trailing window
  // re-fetches it nightly until it settles or leaves the window.
  if (rows.length === 0) return { ok: false, skip: "no_usable_standings" };

  return {
    ok: true,
    tournament: {
      external_key: externalKey,
      name,
      start_date: new Date(startMs).toISOString().slice(0, 10),
      player_count: Math.min(SMALLINT_MAX, playerCount),
      top_cut: null,
    },
    standings: rows,
    standingSkips,
  };
}
