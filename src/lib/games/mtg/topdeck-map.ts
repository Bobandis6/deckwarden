/**
 * Topdeck.gg tournament → row mapping (P3.5).
 *
 * Pure functions consumed by scripts/ingest/topdeck.ts (the spellbook-map.ts
 * division of labor: mapper is pure + unit-tested, IO stays in the script).
 * Input is the documented POST /v2/tournaments bulk shape — every field
 * optional because the contract is defensive: a malformed event or standing
 * skips WITH a counted reason, never throws mid-ingest.
 *
 * Kept bounds, both DISCLOSED on the hub shelf (see schema.ts for the Neon
 * math): events with ≥ MIN_EVENT_PLAYERS players, standings to placement
 * ≤ TOP_PLACEMENT ("top-16 lists" — the plan's top-X phrase at EDHTop16's
 * conventional X).
 *
 * Commander names resolve via normalizeCardName against name_norm EXACTLY —
 * never trgm-fuzzy: a wrong-card match would poison every shelf silently.
 * Unresolved names skip the standing (counted), spellbook's unknown_card
 * pattern. Names come from `deckObj` ("Commanders" section keys — returned
 * when `decklist` is requested and structured data exists) or, failing that,
 * from Topdeck's own `~~Commanders~~`-sectioned decklist text. A bare
 * decklist URL carries no names — those standings skip as no_deck_data and
 * the URL is NOT followed (fetching third-party decklists is out of scope).
 */
import { normalizeCardName } from "../../cards/normalize";

// --- Kept bounds (exported so the shelf can disclose exactly what's stored) ---

/** Events smaller than this are not stored (also sent as participantMin). */
export const MIN_EVENT_PLAYERS = 16;
/** Standings beyond this placement are not stored ("top-16 lists"). */
export const TOP_PLACEMENT = 16;

const SMALLINT_MAX = 32767;
const MAX_URL_LEN = 400;
const MAX_NAME_LEN = 120;

// --- The slice of a bulk-response tournament this job reads -------------------

export interface TopdeckStanding {
  standing?: unknown;
  name?: unknown;
  /** "Decklist text or URL" per docs — Topdeck text uses ~~Section~~ headers. */
  decklist?: unknown;
  /** Structured deck, e.g. { Commanders: {"Kinnan, Bonder Prodigy": ...}, Mainboard: {...} }. */
  deckObj?: unknown;
  wins?: unknown;
  draws?: unknown;
  losses?: unknown;
}

export interface TopdeckTournament {
  TID?: unknown;
  tournamentName?: unknown;
  /** Unix seconds. */
  startDate?: unknown;
  topCut?: unknown;
  standings?: unknown;
}

// --- Output rows (temp-table staging shape) -----------------------------------

export interface TournamentRow {
  external_key: string;
  name: string;
  /** ISO date (UTC). */
  start_date: string;
  player_count: number;
  top_cut: number | null;
}

export interface StandingRow {
  external_key: string;
  placement: number;
  player_name: string | null;
  /** Resolved card_identities ids, sorted (partners = 2 entries). */
  leader_ids: string[];
  decklist_url: string | null;
  wins: number | null;
  draws: number | null;
  losses: number | null;
}

export type TournamentSkip = "malformed" | "too_small" | "no_usable_standings";
export type StandingSkip =
  | "beyond_top_placement"
  | "no_deck_data"
  | "no_commander"
  | "too_many_commanders"
  | "unresolved_commander"
  | "duplicate_placement";

export type TournamentMapResult =
  | {
      ok: true;
      tournament: TournamentRow;
      standings: StandingRow[];
      standingSkips: Partial<Record<StandingSkip, number>>;
      /**
       * How many KEPT standings embedded a full card list (deckObj mainboard
       * with ≥ MIN_LIST_CARDS entries). Pure measurement, nothing stored:
       * this is the empirical gate for two LATER rows — the "seen in top-X
       * lists" ranking signal and co-occurrence mining — so the first live
       * run answers "does Topdeck reliably carry lists?" from ingest stats.
       */
      standingsWithLists: number;
    }
  | { ok: false; skip: TournamentSkip };

// --- Commander-name extraction ------------------------------------------------

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** `1 Kinnan, Bonder Prodigy` / `1x Kinnan…` / bare name → name. */
function stripQty(line: string): string {
  return line.replace(/^\d+\s*x?\s+/i, "").trim();
}

/**
 * Commander names from a standing, or null when the standing carries no deck
 * data we can read (no deckObj, and decklist absent / a URL / unsectioned).
 */
export function commanderNamesFrom(s: TopdeckStanding): string[] | null {
  if (isRecord(s.deckObj)) {
    const key = Object.keys(s.deckObj).find((k) => /^commanders?$/i.test(k.trim()));
    const section = key === undefined ? undefined : s.deckObj[key];
    if (isRecord(section))
      return Object.keys(section)
        .map((n) => n.trim())
        .filter(Boolean);
  }
  if (typeof s.decklist === "string" && !isUrl(s.decklist)) {
    const match = /~~\s*commanders?\s*~~([^~]*)/i.exec(s.decklist);
    if (match) {
      return match[1]
        .split(/\r?\n/)
        .map((line) => stripQty(line))
        .filter(Boolean);
    }
  }
  return null;
}

function isUrl(v: string): boolean {
  return /^https?:\/\/\S+$/i.test(v.trim());
}

/** A stub "Mainboard" section isn't a list; a Commander mainboard has ~98 distinct names. */
const MIN_LIST_CARDS = 40;

/** Whether a standing embeds a readable full card list (see standingsWithLists). */
export function hasCardList(s: TopdeckStanding): boolean {
  if (!isRecord(s.deckObj)) return false;
  const key = Object.keys(s.deckObj).find((k) => /^main/i.test(k.trim()));
  const section = key === undefined ? undefined : s.deckObj[key];
  return isRecord(section) && Object.keys(section).length >= MIN_LIST_CARDS;
}

// --- Field coercion helpers ----------------------------------------------------

function smallintOrNull(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) && v >= 0
    ? Math.min(SMALLINT_MAX, Math.round(v))
    : null;
}

function textOrNull(v: unknown, maxLen: number): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 && trimmed.length <= maxLen ? trimmed : null;
}

// --- Mapping -------------------------------------------------------------------

/**
 * Map one bulk-response tournament. `resolveName` looks a NORMALIZED name up
 * in card_identities.name_norm (exact — the IO script passes a Map lookup).
 */
export function mapTournament(
  t: TopdeckTournament,
  resolveName: (nameNorm: string) => string | undefined,
): TournamentMapResult {
  const externalKey = textOrNull(t.TID, 200);
  const name = textOrNull(t.tournamentName, 300);
  const startSeconds =
    typeof t.startDate === "number" && Number.isFinite(t.startDate) && t.startDate > 0
      ? t.startDate
      : null;
  if (!externalKey || !name || startSeconds === null) return { ok: false, skip: "malformed" };

  const rawStandings: TopdeckStanding[] = Array.isArray(t.standings)
    ? (t.standings as TopdeckStanding[])
    : [];
  // Standings list everyone who played, so its length IS the player count.
  const playerCount = rawStandings.length;
  if (playerCount < MIN_EVENT_PLAYERS) return { ok: false, skip: "too_small" };

  const standingSkips: Partial<Record<StandingSkip, number>> = {};
  const skip = (reason: StandingSkip) => {
    standingSkips[reason] = (standingSkips[reason] ?? 0) + 1;
  };

  const standings: StandingRow[] = [];
  let standingsWithLists = 0;
  const seenPlacements = new Set<number>();
  for (const [index, s] of rawStandings.entries()) {
    const placement =
      typeof s.standing === "number" && Number.isInteger(s.standing) && s.standing >= 1
        ? s.standing
        : index + 1;
    if (placement > TOP_PLACEMENT) {
      skip("beyond_top_placement");
      continue;
    }
    if (seenPlacements.has(placement)) {
      skip("duplicate_placement");
      continue;
    }

    const names = commanderNamesFrom(s);
    if (names === null) {
      skip("no_deck_data");
      continue;
    }
    if (names.length === 0) {
      skip("no_commander");
      continue;
    }
    if (names.length > 2) {
      skip("too_many_commanders");
      continue;
    }
    const leaderIds: string[] = [];
    let unresolved = false;
    for (const rawName of names) {
      const id = resolveName(normalizeCardName(rawName));
      if (!id) {
        unresolved = true;
        break;
      }
      if (!leaderIds.includes(id)) leaderIds.push(id);
    }
    if (unresolved) {
      skip("unresolved_commander");
      continue;
    }
    leaderIds.sort();

    seenPlacements.add(placement);
    if (hasCardList(s)) standingsWithLists++;
    standings.push({
      external_key: externalKey,
      placement,
      player_name: textOrNull(s.name, MAX_NAME_LEN),
      leader_ids: leaderIds,
      decklist_url:
        typeof s.decklist === "string" && isUrl(s.decklist)
          ? textOrNull(s.decklist, MAX_URL_LEN)
          : null,
      wins: smallintOrNull(s.wins),
      draws: smallintOrNull(s.draws),
      losses: smallintOrNull(s.losses),
    });
  }

  // An event where nothing survived (e.g. decklists never published) would be
  // a dead row no shelf can render — don't store it.
  if (standings.length === 0) return { ok: false, skip: "no_usable_standings" };

  return {
    ok: true,
    tournament: {
      external_key: externalKey,
      name,
      start_date: new Date(startSeconds * 1000).toISOString().slice(0, 10),
      player_count: Math.min(SMALLINT_MAX, playerCount),
      top_cut: smallintOrNull(t.topCut),
    },
    standings,
    standingSkips,
    standingsWithLists,
  };
}
