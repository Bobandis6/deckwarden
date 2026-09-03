/**
 * Pure mapping from punk-records v2.0 English JSON to Deckwarden rows (P4.1).
 * No IO here (working agreement: game logic in adapters, pure functions);
 * scripts/ingest/punk-records.ts is the IO glue.
 *
 * Upstream shape (verified live against buhbbl/punk-records@916181e1, v2.0,
 * source "vegapull"): `english/data/<pack_id>.json` aggregates carry the FULL
 * field set (effect, trigger, block_number…) but list parallel/reprint entries
 * and cross-pack reprints too, so identities read only base entries (id with
 * no `_` suffix — 2,785 at the pinned sha); `english/index/cards_by_id.json`
 * is the printing authority: one entry per id — base + `_pN` parallel arts +
 * `_rN` reprints, 4,843 total — each with its own pack_id and image URL.
 *
 * Design decisions (each test-pinned):
 *  - identity = base card id ("OP01-001") as external_key; the CARD ID is the
 *    identity, never the name — 1,615 duplicate names ("Monkey.D.Luffy" many
 *    times over) across distinct base ids.
 *  - name_norm uses the shared normalizer UNCHANGED: dots in 338 names stay
 *    literal ("monkey.d.luffy"). OP import resolution is by card id (the
 *    external_key pass in /api/cards/resolve), and trgm absorbs dotless typing
 *    in search — a dot-folding rule would force a full MTG re-ingest for no
 *    measured win (normalize.ts header).
 *  - leader `cost` IS the life total — Bandai's cardlist reuses the cost slot.
 *    Verified against optcgapi.com on the outliers: Edward.Newgate 6,
 *    Enel 4, Vegapunk 2 (`card_cost` null, `life` matching, 2026-09-03).
 *    Leaders get cost_value NULL (they're never cast) and attrs.life instead.
 *  - effect text is stored ONCE, under the `oracle_text`/`type_line` keys the
 *    search_text generated column hardcodes (schema.ts) — those keys are the
 *    cross-game FTS contract, not an MTG leak; the adapter's display reads
 *    them. Trigger text is its own key (the M4 validator will want it
 *    structured) and is deliberately NOT folded into oracle_text.
 *  - colors_mask == ci_mask: OP has no color-identity concept distinct from
 *    the card's printed colors — same mask in both columns, by declaration.
 */
import { createHash } from "node:crypto";

import { GAME_ID } from "@/db/seed-data";
import { normalizeCardName } from "@/lib/cards/normalize";

import type { OptcgAttrs } from "./adapter";

// --- punk-records input (minimal shape we consume) ---------------------------

/** Full-schema entry from english/data/<pack_id>.json. */
export interface PunkCard {
  id: string;
  pack_id: string;
  name: string;
  rarity: string | null;
  category: "Leader" | "Character" | "Event" | "Stage" | string;
  colors: string[] | null;
  cost: number | null;
  power: number | null;
  counter: number | null;
  attributes: string[] | null;
  types: string[] | null;
  effect: string | null;
  trigger: string | null;
  block_number: number | null;
  img_url: string;
  img_full_url: string;
}

/** Slim entry from english/index/cards_by_id.json (printing authority). */
export interface PunkIndexEntry {
  card_id: string;
  pack_id: string;
  name: string;
  rarity: string | null;
  category: string;
  /** Absolute Bandai URL incl. the ?YYMMDD cache-buster. */
  img_url: string;
}

export interface PunkPack {
  id: string;
  raw_title: string;
  title_parts: { label: string | null; prefix: string | null; title: string | null } | null;
}

// --- Colors ------------------------------------------------------------------

/**
 * The six OP colors on the shared schema bits (W1 U2 B4 R8 G16 C32) — THE one
 * place this mapping lives. Colors that exist in both games keep their bit
 * (Red 8, Green 16, Blue 2, Black 4); Yellow takes W's bit 1 and Purple takes
 * C's bit 32. Query-side, the colorset grammar (translate.ts) speaks MTG
 * letters, so OP color filters spell Yellow as W and Purple as C — disclosed
 * here and in the adapter until an OP search UI needs friendlier letters.
 */
export const OPTCG_COLOR_BIT: Record<string, number> = {
  Red: 8,
  Green: 16,
  Blue: 2,
  Black: 4,
  Yellow: 1,
  Purple: 32,
};

export function optcgColorsToMask(colors: string[] | null | undefined): number {
  let mask = 0;
  for (const c of colors ?? []) mask |= OPTCG_COLOR_BIT[c] ?? 0;
  return mask;
}

// --- Ids ---------------------------------------------------------------------

/** "OP01-001_p2" → "OP01-001"; base ids pass through. */
export function baseCardId(printingKey: string): string {
  return printingKey.split("_")[0];
}

/** True for the base entry of an id (no _pN/_rN suffix) — the default printing. */
export function isBasePrinting(printingKey: string): boolean {
  return !printingKey.includes("_");
}

/**
 * Deterministic printing uuid (RFC 4122 v5, SHA-1) over game + printing key.
 * card_printings.id has no DB default (mtg reuses Scryfall's uuid); OP has no
 * upstream uuid, so we mint one that is STABLE across re-ingests and
 * pg_dump/restore. The namespace is arbitrary but frozen forever — changing
 * it would orphan every deck's printing references.
 */
const OPTCG_PRINTING_NAMESPACE = "b6a9c8b2-3f6e-4d0a-9a51-7c2d8e5f1a3b";

export function optcgPrintingId(printingKey: string): string {
  const ns = OPTCG_PRINTING_NAMESPACE.replace(/-/g, "");
  const nsBytes = Buffer.from(ns, "hex");
  const hash = createHash("sha1").update(nsBytes).update(`optcg:${printingKey}`).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50; // version 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // RFC 4122 variant
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// --- Sets --------------------------------------------------------------------

/**
 * sets.code from packs.json title_parts.label, verbatim — labels are unique
 * across all 60 packs at the pinned sha, including the combined-launch packs
 * ("OP14-EB04", "OP15-EB04"), and a unique key must stay stable so verbatim
 * beats normalized. The two label-less pseudo-packs get minted codes.
 * released_at is NULL everywhere: punk-records v2.0 carries no release dates
 * (decided: no hand-maintained date map until something needs to sort on it).
 */
const PACK_CODE_OVERRIDES: Record<string, string> = {
  "569801": "OTHER", // "Other Product Card"
  "569901": "PROMO", // "Promotion card"
};

export function packSetCode(pack: PunkPack): string | null {
  return PACK_CODE_OVERRIDES[pack.id] ?? pack.title_parts?.label ?? null;
}

export function packSetName(pack: PunkPack): string {
  return pack.title_parts?.title ?? pack.raw_title;
}

// --- Row mapping -------------------------------------------------------------

export interface OptcgIdentityRow {
  game_id: number;
  external_key: string;
  name: string;
  name_norm: string;
  primary_type: string | null;
  cost_value: number | null;
  colors_mask: number;
  ci_mask: number;
  is_leader_candidate: boolean;
  popularity: null;
  is_preview: boolean;
  attrs: string; // JSON text; cast to jsonb at merge
}

export interface OptcgPrintingRow {
  id: string;
  external_key: string;
  game_id: number;
  pack_id: string;
  collector_number: string;
  rarity: string | null;
  finishes: string[];
  has_back: boolean;
  is_default: boolean;
  image_override: string; // JSON text {front}; cast to jsonb at merge
  content_hash: string;
}

/** "Leader — Supernovas / Straw Hat Crew" — the FTS type line, category + traits. */
function typeLine(card: PunkCard): string {
  const traits = (card.types ?? []).join(" / ");
  return traits ? `${card.category} — ${traits}` : card.category;
}

export function mapOptcgIdentity(card: PunkCard): OptcgIdentityRow {
  const isLeader = card.category === "Leader";
  const attrs: OptcgAttrs = {
    category: card.category.toLowerCase() as OptcgAttrs["category"],
    type_line: typeLine(card),
  };
  if (card.effect) attrs.oracle_text = card.effect;
  if (card.trigger) attrs.trigger_text = card.trigger;
  if (card.types?.length) attrs.traits = card.types;
  if (card.attributes?.length) attrs.attributes = card.attributes;
  if (card.power != null) attrs.power_num = card.power;
  if (card.counter != null) attrs.counter_num = card.counter;
  if (isLeader && card.cost != null) attrs.life = card.cost;
  if (card.block_number != null) attrs.block = card.block_number;
  const mask = optcgColorsToMask(card.colors);
  return {
    game_id: GAME_ID.optcg,
    external_key: card.id,
    name: card.name,
    name_norm: normalizeCardName(card.name),
    primary_type: card.category,
    cost_value: isLeader ? null : (card.cost ?? null),
    colors_mask: mask,
    ci_mask: mask,
    is_leader_candidate: isLeader,
    popularity: null,
    is_preview: false,
    attrs: JSON.stringify(attrs),
  };
}

/**
 * One printing per index entry. collector_number is the full printing key
 * ("EB04-011_p1") — OP has no separate collector numbers, and the combined
 * packs mix id prefixes, so anything shorter is ambiguous. finishes stays []
 * (punk-records has no finish data — never invent). The image URL goes in
 * image_override.front (the no-code-change hook: printingImageUrl serves
 * overrides as-is), pointing at Bandai's official hosting until the R2
 * public domain exists — `r2ImageBase`, when set, flips it to
 * `<base>/optcg/images/<key>.png` (the mirror job's layout).
 */
export function mapOptcgPrinting(
  printingKey: string,
  entry: PunkIndexEntry,
  r2ImageBase: string | null,
): OptcgPrintingRow {
  const imageUrl = r2ImageBase
    ? `${r2ImageBase.replace(/\/$/, "")}/optcg/images/${printingKey}.png`
    : entry.img_url;
  const row = {
    id: optcgPrintingId(printingKey),
    external_key: baseCardId(printingKey),
    game_id: GAME_ID.optcg,
    pack_id: entry.pack_id,
    collector_number: printingKey,
    rarity: entry.rarity ?? null,
    finishes: [] as string[],
    has_back: false,
    is_default: isBasePrinting(printingKey),
    image_override: JSON.stringify({ front: imageUrl }),
  };
  // md5 over the mapped fields (scryfall.ts hash-guard pattern) — includes the
  // image URL on purpose: a Bandai cache-buster or R2 flip is a real change.
  const content_hash = createHash("md5")
    .update(
      JSON.stringify([
        row.id,
        row.external_key,
        row.pack_id,
        row.collector_number,
        row.rarity,
        row.is_default,
        imageUrl,
      ]),
    )
    .digest("hex");
  return { ...row, content_hash };
}
