/**
 * Buy-link assembly (W7, D6): pure string builders between an adapter's
 * `capabilities.buy` declaration and the menus that render it. Links OUT
 * only — no Deckwarden server ever contacts a vendor.
 *
 * URL shape live-verified on tcgplayer.com 2026-09-20:
 *   https://www.tcgplayer.com/massentry?productline=Magic&c=1%20Sol%20Ring%7C%7C33%20Mountain
 * pre-fills the Items box ("||" separates lines, spaces stay %20) and opens
 * the Item Options dialog one click from Add to Cart; `productline=` drives
 * the product-line select (checked with a non-default line).
 *
 * Affiliate posture: NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE stays EMPTY on Vercel
 * Hobby (non-commercial plan). `withPartner` is the single wrap point; the
 * length cliff is measured on the FINAL url because the Impact `?u=` wrapper
 * double-encodes the list and long decks hit the copy path more often.
 */
import type { GameAdapter } from "@/lib/games/types";

export type BuyCapability = NonNullable<GameAdapter["capabilities"]["buy"]>;

/** A structural slice of EditorCard/CardWire — what the buy fns consume. */
export type BuyCard = Parameters<BuyCapability["massEntryLine"]>[0];

/**
 * Above this, browsers/CDNs get unreliable (~8k is the classic cliff; ≈6k
 * leaves headroom for the affiliate wrap). Measured on the FINAL url.
 */
export const MASS_ENTRY_URL_MAX = 6000;

/** Affiliate wrap: dark (identity) until the env var exists — never on Hobby. */
export function withPartner(url: string): string {
  const base = process.env.NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE;
  return base ? `${base}${encodeURIComponent(url)}` : url;
}

export function massEntryUrl(productLine: string, lines: readonly string[]): string {
  return `https://www.tcgplayer.com/massentry?productline=${encodeURIComponent(
    productLine,
  )}&c=${encodeURIComponent(lines.join("||"))}`;
}

/** The empty form (still product-line-selected) — the copy-list path's target. */
export function bareMassEntryUrl(productLine: string): string {
  return `https://www.tcgplayer.com/massentry?productline=${encodeURIComponent(productLine)}`;
}

/**
 * One menu item's destination. Over the cliff the item stops being a link:
 * copy the list, open the bare form, toast — a first-class path, not an error.
 */
export type MassEntryHref =
  { kind: "link"; url: string } | { kind: "copy"; text: string; bareUrl: string };

export function massEntryHref(productLine: string, lines: readonly string[]): MassEntryHref {
  const url = withPartner(massEntryUrl(productLine, lines));
  if (url.length <= MASS_ENTRY_URL_MAX) return { kind: "link", url };
  return {
    kind: "copy",
    text: lines.join("\n"),
    bareUrl: withPartner(bareMassEntryUrl(productLine)),
  };
}

export interface DeckBuyOption {
  id: "all" | "nonbasic" | "missing";
  /** D6's menu labels, shared verbatim by the share menu and the editor dialog. */
  label: string;
  /** Σ qty over the option's lines — the number in the item's parens. */
  count: number;
  lines: string[];
}

/**
 * The three D6 items with live counts. `owned` present = a signed-in viewer
 * with a collection (the share page's own gate) — only then does "Only cards
 * I'm missing" exist, and its count is the same per-copy math as the page's
 * "You own N/M" line (unowned identities × their deck qty). Entries whose
 * card is missing from the map are skipped, never guessed.
 */
export function deckBuyOptions(
  buy: BuyCapability,
  entries: readonly { cardId: string; qty: number }[],
  cards: ReadonlyMap<string, BuyCard>,
  owned?: ReadonlySet<string>,
): DeckBuyOption[] {
  const resolved: { cardId: string; qty: number; card: BuyCard }[] = [];
  for (const e of entries) {
    const card = cards.get(e.cardId);
    if (card) resolved.push({ cardId: e.cardId, qty: e.qty, card });
  }

  const toOption = (
    id: DeckBuyOption["id"],
    label: string,
    rows: typeof resolved,
  ): DeckBuyOption => ({
    id,
    label,
    count: rows.reduce((sum, r) => sum + r.qty, 0),
    lines: rows.map((r) => buy.massEntryLine(r.card, r.qty)),
  });

  const options = [
    toOption("all", "Whole deck", resolved),
    toOption(
      "nonbasic",
      "Without basic lands",
      resolved.filter((r) => !buy.skipByDefault?.(r.card)),
    ),
  ];
  if (owned !== undefined) {
    options.push(
      toOption(
        "missing",
        "Only cards I'm missing",
        resolved.filter((r) => !owned.has(r.cardId)),
      ),
    );
  }
  return options;
}
