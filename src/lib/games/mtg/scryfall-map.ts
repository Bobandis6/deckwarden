/**
 * Pure mapping from Scryfall bulk `default_cards` objects to Deckwarden rows.
 * No IO here (working agreement: game logic in adapters, pure functions);
 * scripts/ingest/scryfall.ts is the IO glue.
 *
 * Lean-row rules applied here (build plan §4): no raw Scryfall JSON is kept —
 * only the fields queries touch; attrs numerics pre-normalized (power_num etc.);
 * prices stripped of null entries; content_hash excludes prices.
 */
import { createHash } from "node:crypto";

import { normalizeCardName } from "@/lib/cards/normalize";
import { GAME_ID } from "@/db/seed-data";

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
  prices?: Record<string, string | null>;
  image_uris?: Record<string, string>;
  card_faces?: ScryfallCardFace[];
}

// --- Skip filter -------------------------------------------------------------

/** Layouts that are not deck cards (plan: token/art-series skipped). */
const SKIPPED_LAYOUTS = new Set(["token", "double_faced_token", "emblem", "art_series"]);

export type SkipReason = "non_english" | "layout" | "no_oracle_id" | null;

export function skipReason(card: ScryfallCard): SkipReason {
  if (card.lang !== "en") return "non_english";
  if (SKIPPED_LAYOUTS.has(card.layout)) return "layout";
  if (!oracleId(card)) return "no_oracle_id";
  return null;
}

export function oracleId(card: ScryfallCard): string | undefined {
  return card.oracle_id ?? card.card_faces?.[0]?.oracle_id;
}

// --- Field helpers -----------------------------------------------------------

/** W1 U2 B4 R8 G16 C32. Colorless = 0 so the ci fit test (ci & ~cmdCi) = 0 holds. */
const COLOR_BIT: Record<string, number> = { W: 1, U: 2, B: 4, R: 8, G: 16, C: 32 };

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

export function isLeaderCandidate(card: ScryfallCard): boolean {
  const typeLine = foldFaces(card, "type_line", " // ");
  const front = typeLine.split(" // ")[0];
  if (front.includes("Legendary") && front.includes("Creature")) return true;
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

function buildAttrs(card: ScryfallCard): Record<string, unknown> {
  const faces = card.card_faces;
  const attrs: Record<string, unknown> = {
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
  return attrs;
}

export function mapIdentity(card: ScryfallCard, todayIso: string): IdentityRow {
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
    is_leader_candidate: isLeaderCandidate(card),
    popularity: card.edhrec_rank ?? null,
    is_preview: (card.released_at ?? "") > todayIso,
    attrs: JSON.stringify(buildAttrs(card)),
  };
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
