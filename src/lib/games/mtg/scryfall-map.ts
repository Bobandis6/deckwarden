/**
 * Pure mapping from Scryfall bulk `default_cards` objects to Deckwarden rows.
 * No IO here (working agreement: game logic in adapters, pure functions);
 * scripts/ingest/scryfall.ts is the IO glue.
 *
 * Lean-row rules applied here (build plan §4): no raw Scryfall JSON is kept —
 * only the fields queries touch; attrs numerics pre-normalized (power_num etc.);
 * prices stripped of null entries; content_hash excludes prices.
 *
 * Tokens (DECK-TOKENS, 2026-10-24 — the plan's "token layouts skipped" line
 * retired at the owner's ask): token, double-faced token and emblem objects
 * are ingested as the token catalog, marked `attrs.is_token` and never leader
 * candidates; World Championship and minigame inserts and checklists stay
 * out. Cards carry `attrs.tokens`, the catalog objects Scryfall's `all_parts`
 * links them to — resolved by the ingest after the stream (resolveTokenLinks),
 * because a link names a token PRINTING that may not have streamed yet.
 */
import { createHash } from "node:crypto";

import { normalizeCardName } from "@/lib/cards/normalize";
import { GAME_ID } from "@/db/seed-data";

import { COLOR_BIT } from "../colors";
import type { MtgAttrs } from "./attrs";
import type { TaggerCardFlags } from "./tagger";

// --- Scryfall input (minimal shape we consume) ------------------------------

export interface ScryfallCardFace {
  name?: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  oracle_id?: string;
  image_uris?: Record<string, string>;
}

export interface ScryfallCard {
  id: string;
  oracle_id?: string;
  lang: string;
  layout: string;
  name: string;
  released_at?: string;
  set: string;
  set_name?: string;
  collector_number: string;
  /** Scryfall's set classification ("token", "memorabilia", "minigame", …) — the token catalog's junk filter reads it. */
  set_type?: string;
  rarity?: string;
  finishes?: string[];
  digital?: boolean;
  cmc?: number;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  colors?: string[];
  color_identity?: string[];
  keywords?: string[];
  edhrec_rank?: number;
  /** Wizards' Game Changers list (Y3a). Present on every object since 2025; null is not false. */
  game_changer?: boolean | null;
  legalities?: Record<string, string>;
  prices?: Record<string, string | null>;
  image_uris?: Record<string, string>;
  card_faces?: ScryfallCardFace[];
  /** Related objects (DECK-TOKENS): the tokens, emblems and game pieces a card makes or uses. */
  all_parts?: ScryfallRelatedCard[];
}

/** One `all_parts` entry: a related object, named by its PRINTING id. */
export interface ScryfallRelatedCard {
  id: string;
  /** "token" | "combo_piece" | "meld_part" | "meld_result". */
  component: string;
  name: string;
  type_line?: string;
}

// --- Skip filter -------------------------------------------------------------

/** Layouts that are not cards at all (art cards); everything else maps. */
const SKIPPED_LAYOUTS = new Set(["art_series"]);

/** The token catalog's layouts (DECK-TOKENS): tokens, double-faced tokens, emblems. */
const TOKEN_LAYOUTS = new Set(["token", "double_faced_token", "emblem"]);

/**
 * Set types whose token-catalog printings are souvenirs, not game pieces:
 * World Championship bios, decklists and ads, minigame inserts, Theros
 * challenge-deck cards (120 objects at 2026-10-24, every one only there).
 */
const NON_PIECE_SET_TYPES = new Set(["memorabilia", "minigame"]);

export type SkipReason = "non_english" | "layout" | "no_oracle_id" | "token_extra" | null;

export function skipReason(card: ScryfallCard): SkipReason {
  if (card.lang !== "en") return "non_english";
  if (SKIPPED_LAYOUTS.has(card.layout)) return "layout";
  if (!oracleId(card)) return "no_oracle_id";
  if (isTokenObject(card) && (NON_PIECE_SET_TYPES.has(card.set_type ?? "") || isChecklist(card)))
    return "token_extra";
  return null;
}

/**
 * A token-catalog object (DECK-TOKENS): a token, double-faced token or
 * emblem layout, or any object whose front face carries the Token supertype
 * — Scryfall prints Role tokens on `flip` and Mechtitan on `reversible_card`,
 * which is how seven tokens (Mechtitan a "commander") reached the catalog
 * before this rule.
 */
export function isTokenObject(card: ScryfallCard): boolean {
  if (TOKEN_LAYOUTS.has(card.layout)) return true;
  const front = foldFaces(card, "type_line", " // ").split(" // ")[0];
  return front.split(" — ")[0].split(" ").includes("Token");
}

/** Set checklists ship in token sets as "Card"-typed inserts; they are lists, not pieces. */
function isChecklist(card: ScryfallCard): boolean {
  const front = foldFaces(card, "type_line", " // ").split(" // ")[0];
  return front === "Card" && /\bChecklist\b/.test(card.name);
}

export function oracleId(card: ScryfallCard): string | undefined {
  return card.oracle_id ?? card.card_faces?.[0]?.oracle_id;
}

// --- Field helpers -----------------------------------------------------------

/** Scryfall's letters on the shared bits (colors.ts). Colorless = 0 so the ci fit test (ci & ~cmdCi) = 0 holds. */
export function colorsToMask(colors: string[] | undefined): number {
  let mask = 0;
  for (const c of colors ?? []) mask |= COLOR_BIT[c] ?? 0;
  return mask;
}

const PRIMARY_TYPES = [
  "Creature",
  "Planeswalker",
  "Battle",
  "Instant",
  "Sorcery",
  "Artifact",
  "Enchantment",
  "Land",
  "Conspiracy",
  "Phenomenon",
  "Plane",
  "Scheme",
  "Vanguard",
  "Dungeon",
] as const;

/** Front-face card type, e.g. "Legendary Creature — Elf" → "Creature". */
export function primaryType(typeLine: string | undefined): string | null {
  if (!typeLine) return null;
  const front = typeLine.split(" // ")[0];
  for (const t of PRIMARY_TYPES) if (front.includes(t)) return t;
  const left = front.split(" — ")[0].trim().split(" ");
  return left[left.length - 1] || null;
}

const SMALLINT_MAX = 32767;

/** "3" → 3, "*" → null, "1+*" → 1, "-1" → -1, "3.5" → 4 (rounded). */
export function statToNum(stat: string | undefined): number | null {
  if (stat == null) return null;
  const m = stat.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Math.round(Number(m[0]));
  return Math.max(-SMALLINT_MAX, Math.min(SMALLINT_MAX, n));
}

function clampCost(cmc: number | undefined): number | null {
  if (cmc == null || !Number.isFinite(cmc)) return null;
  return Math.min(SMALLINT_MAX, Math.round(cmc));
}

function foldFaces(card: ScryfallCard, field: "type_line" | "oracle_text", sep: string): string {
  const top = card[field];
  if (top != null) return top;
  return (card.card_faces ?? []).map((f) => f[field] ?? "").join(sep);
}

/**
 * CR 903.3 (verified 2026-09-02, MagicCompRules 20260227): a commander must be
 * a legendary (a) creature card, (b) Vehicle card, or (c) Spacecraft card with
 * one or more power/toughness boxes — WotC's errata removed the "can be your
 * commander" sentence from legendary Vehicles when (b)/(c) were added, so the
 * type line is the only signal for them. The Spacecraft P/T qualifier is load-
 * bearing: The Eternity Elevator (Legendary Artifact — Spacecraft, no P/T box)
 * is not a legal commander. The oracle-text fallback covers 903.3a grants
 * (planeswalkers etc.). Front face only, as everywhere else in this file.
 */
export function isLeaderCandidate(card: ScryfallCard): boolean {
  const typeLine = foldFaces(card, "type_line", " // ");
  const front = typeLine.split(" // ")[0];
  if (front.includes("Legendary")) {
    if (front.includes("Creature") || front.includes("Vehicle")) return true;
    if (front.includes("Spacecraft") && (card.power ?? card.card_faces?.[0]?.power) != null)
      return true;
  }
  const text = foldFaces(card, "oracle_text", "\n");
  return /can be your commander/i.test(text);
}

/** Drop null/empty entries; null when nothing remains — never store `{}` filler. */
export function leanPrices(
  prices: Record<string, string | null> | undefined,
): Record<string, string> | null {
  if (!prices) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(prices)) if (v != null) out[k] = v;
  return Object.keys(out).length ? out : null;
}

// --- Row mapping ---------------------------------------------------------------

export interface IdentityRow {
  game_id: number;
  external_key: string;
  name: string;
  name_norm: string;
  primary_type: string | null;
  cost_value: number | null;
  colors_mask: number;
  ci_mask: number;
  is_leader_candidate: boolean;
  popularity: number | null;
  is_preview: boolean;
  attrs: string; // JSON text; cast to jsonb at merge
}

export interface PrintingRow {
  id: string;
  oracle_id: string;
  game_id: number;
  set_code: string;
  collector_number: string;
  rarity: string | null;
  finishes: string[];
  has_back: boolean;
  released_at: string | null;
  prices: string | null; // JSON text; cast to jsonb at merge
  content_hash: string;
}

/**
 * Typed as MtgAttrs (LATER row, fired by P2.5) so the attrs contract can't drift from ingest.
 * Bracket facts are sparse (Y3a): `game_changer` only when true, Tagger flags only when given.
 * Swap Lab's roles (Y7a) likewise: written only when the card has at least one.
 * `is_token` (DECK-TOKENS) likewise: only on token-catalog objects. `tokens` is
 * the ingest's to add after the stream (resolveTokenLinks), never mapped here.
 */
function buildAttrs(card: ScryfallCard, flags: TaggerCardFlags): MtgAttrs {
  const faces = card.card_faces;
  const attrs: MtgAttrs = {
    type_line: foldFaces(card, "type_line", " // "),
    oracle_text: foldFaces(card, "oracle_text", "\n//\n"),
  };
  const manaCost = card.mana_cost ?? faces?.[0]?.mana_cost;
  if (manaCost) attrs.mana_cost = manaCost;
  if (card.keywords?.length) attrs.keywords = card.keywords;
  const power = card.power ?? faces?.[0]?.power;
  const toughness = card.toughness ?? faces?.[0]?.toughness;
  const loyalty = card.loyalty ?? faces?.[0]?.loyalty;
  if (power != null) {
    attrs.power = power;
    attrs.power_num = statToNum(power);
  }
  if (toughness != null) {
    attrs.toughness = toughness;
    attrs.toughness_num = statToNum(toughness);
  }
  if (loyalty != null) attrs.loyalty = loyalty;
  if (faces?.length) {
    attrs.faces = faces.map((f) => ({
      name: f.name,
      mana_cost: f.mana_cost,
      type_line: f.type_line,
      oracle_text: f.oracle_text,
      ...(f.power != null ? { power: f.power } : {}),
      ...(f.toughness != null ? { toughness: f.toughness } : {}),
      ...(f.loyalty != null ? { loyalty: f.loyalty } : {}),
    }));
  }
  if (card.game_changer === true) attrs.game_changer = true;
  if (flags.mld) attrs.mld = flags.mld;
  if (flags.extra_turn) attrs.extra_turn = true;
  if (flags.roles?.length) attrs.roles = [...flags.roles];
  if (isTokenObject(card)) attrs.is_token = true;
  return attrs;
}

/**
 * Scryfall's `reversible_card` layout (two-sided printings whose sides are
 * the same card, or an alternate-art restatement of a DFC) repeats each side
 * in `card_faces` and joins every face name into the top-level `name`.
 * Mapping that verbatim minted doubled identities — "Chulane, Teller of
 * Tales // Chulane, Teller of Tales", and tripled forms like "Marang River
 * Regent // Coil and Catch // Marang River Regent" (12 + 2 in prod,
 * 2026-09-02) — with doubled name_norm, so exact resolution (the Topdeck
 * leader map, decklist import) missed them entirely. Identity mapping
 * dedupes identical faces first: one surviving face is a normal single-faced
 * card (name + fields from that face, no `faces` attr); distinct faces keep
 * the real "A // B". Printing mapping is untouched — a reversible printing
 * really does have a back image (hasBack reads the raw faces).
 */
export function dedupeReversibleFaces(card: ScryfallCard): ScryfallCard {
  if (card.layout !== "reversible_card" || !card.card_faces?.length) return card;
  const seen = new Set<string>();
  const faces = card.card_faces.filter((f) => {
    const key = f.name ?? "";
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const name =
    faces
      .map((f) => f.name)
      .filter(Boolean)
      .join(" // ") || card.name;
  if (faces.length > 1) return { ...card, name, card_faces: faces };
  const f = faces[0];
  return {
    ...card,
    name,
    card_faces: undefined,
    // reversible cards carry oracle_id on the faces, not the top level
    oracle_id: card.oracle_id ?? f.oracle_id,
    mana_cost: card.mana_cost ?? f.mana_cost,
    type_line: card.type_line ?? f.type_line,
    oracle_text: card.oracle_text ?? f.oracle_text,
    power: card.power ?? f.power,
    toughness: card.toughness ?? f.toughness,
    loyalty: card.loyalty ?? f.loyalty,
    colors: card.colors ?? f.colors,
  };
}

/** `flags`: this card's Scryfall Tagger flags and roles, resolved by the ingest before staging (Y3a, Y7a). */
export function mapIdentity(
  rawCard: ScryfallCard,
  todayIso: string,
  flags: TaggerCardFlags = {},
): IdentityRow {
  const card = dedupeReversibleFaces(rawCard);
  const colors =
    card.colors ?? Array.from(new Set((card.card_faces ?? []).flatMap((f) => f.colors ?? [])));
  return {
    game_id: GAME_ID.mtg,
    external_key: oracleId(card)!,
    name: card.name,
    name_norm: normalizeCardName(card.name),
    primary_type: primaryType(foldFaces(card, "type_line", " // ")),
    cost_value: clampCost(card.cmc),
    colors_mask: colorsToMask(colors),
    ci_mask: colorsToMask(card.color_identity),
    // A token is never a commander, legendary or not (Marit Lage, Ragavan, Mechtitan).
    is_leader_candidate: !isTokenObject(card) && isLeaderCandidate(card),
    popularity: card.edhrec_rank ?? null,
    is_preview: (card.released_at ?? "") > todayIso,
    attrs: JSON.stringify(buildAttrs(card, flags)),
  };
}

/**
 * The Game Changers' fingerprint (Y3a): md5 of the sorted oracle ids, one per
 * line. The Scryfall run records it in stats.game_changers; the nightly's
 * ruleset watch compares it with the hash pinned in ./bracket-ruleset.ts.
 */
export function gameChangerDigest(oracleIds: Iterable<string>): string {
  return createHash("md5")
    .update([...oracleIds].sort().join("\n"))
    .digest("hex");
}

/**
 * The printing ids a card's `all_parts` links it to that could be catalog
 * objects (DECK-TOKENS): "token" (what it makes) and "combo_piece" (emblems
 * and game pieces it uses — The Monarch, Energy Reserve, Day // Night — but
 * also partner cards, which resolveTokenLinks drops for not being in the
 * catalog). Meld links are cards, never tokens. A card's link to its own
 * printing is skipped.
 */
export function tokenLinkPrintings(card: ScryfallCard): string[] {
  return (card.all_parts ?? [])
    .filter((p) => p.id !== card.id && (p.component === "token" || p.component === "combo_piece"))
    .map((p) => p.id);
}

/**
 * `attrs.tokens` per card (DECK-TOKENS): each card's linked printing ids
 * (gathered across all its printings) mapped through the token catalog's
 * printing → oracle id table, deduped and sorted so the identity merge's
 * IS DISTINCT FROM sees the same list every night. Links to anything outside
 * the catalog (cards, skipped inserts, other languages) and to the card's own
 * oracle id drop out; a card left with none gets no entry.
 */
export function resolveTokenLinks(
  linksByOracle: ReadonlyMap<string, ReadonlySet<string>>,
  tokenOracleByPrinting: ReadonlyMap<string, string>,
): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [oracle, printings] of linksByOracle) {
    const tokens = new Set<string>();
    for (const printing of printings) {
      const token = tokenOracleByPrinting.get(printing);
      if (token && token !== oracle) tokens.add(token);
    }
    if (tokens.size > 0) out.set(oracle, [...tokens].sort());
  }
  return out;
}

/** True when the printing has a distinct back face image (transform/MDFC/etc.). */
export function hasBack(card: ScryfallCard): boolean {
  return !card.image_uris && Boolean(card.card_faces?.some((f) => f.image_uris));
}

/** md5 over printing fields EXCLUDING prices — the re-ingest skip switch. */
export function printingContentHash(card: ScryfallCard): string {
  const h = createHash("md5");
  h.update(
    JSON.stringify([
      card.id,
      oracleId(card),
      card.set,
      card.collector_number,
      card.rarity,
      card.finishes,
      hasBack(card),
      card.released_at,
      card.digital ?? false,
    ]),
  );
  return h.digest("hex");
}

export function mapPrinting(card: ScryfallCard): PrintingRow {
  const prices = leanPrices(card.prices);
  return {
    id: card.id,
    oracle_id: oracleId(card)!,
    game_id: GAME_ID.mtg,
    set_code: card.set,
    collector_number: card.collector_number,
    rarity: card.rarity ?? null,
    finishes: card.finishes ?? [],
    has_back: hasBack(card),
    released_at: card.released_at ?? null,
    prices: prices ? JSON.stringify(prices) : null,
    content_hash: printingContentHash(card),
  };
}
