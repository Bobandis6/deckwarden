/**
 * Commander deck analytics — declarative blocks (histogram/breakdown/stat),
 * never components (build plan §3). Pure, qty-weighted, lands excluded from
 * curve math. colorVar names are CSS custom properties the core's theme defines.
 */
import type { AnalyticsBlock, CardData, DeckSnapshot } from "../types";
import type { MtgAttrs } from "./attrs";

type MtgCard = CardData<MtgAttrs>;

const COLOR_SLICES = [
  { bit: 1, label: "White", colorVar: "--mana-w" },
  { bit: 2, label: "Blue", colorVar: "--mana-u" },
  { bit: 4, label: "Black", colorVar: "--mana-b" },
  { bit: 8, label: "Red", colorVar: "--mana-r" },
  { bit: 16, label: "Green", colorVar: "--mana-g" },
  { bit: 32, label: "Colorless", colorVar: "--mana-c" },
] as const;

function isLand(card: MtgCard): boolean {
  return card.primaryType === "Land";
}

export function analyzeMtg(deck: DeckSnapshot, cards: Map<string, MtgCard>): AnalyticsBlock[] {
  // Commander analytics cover the whole 100 (command zone included).
  const entries = Object.values(deck.zones)
    .flat()
    .map((e) => ({ qty: e.qty, card: cards.get(e.cardId) }))
    .filter((e): e is { qty: number; card: MtgCard } => e.card != null);

  // Mana curve: 0..6 and 7+, nonland only.
  const curve = new Array<number>(8).fill(0);
  let nonlandQty = 0;
  let mvSum = 0;
  let landQty = 0;
  let priceSum = 0;
  let pricedQty = 0;
  const typeQty = new Map<string, number>();
  const colorQty = new Map<string, number>();

  for (const { qty, card } of entries) {
    typeQty.set(card.primaryType ?? "Other", (typeQty.get(card.primaryType ?? "Other") ?? 0) + qty);
    if (card.cheapestUsd != null) {
      priceSum += card.cheapestUsd * qty;
      pricedQty += qty;
    }
    if (isLand(card)) {
      landQty += qty;
      continue;
    }
    nonlandQty += qty;
    const mv = card.costValue ?? 0;
    mvSum += mv * qty;
    curve[Math.min(mv, 7)] += qty;
    const mask = card.colorsMask === 0 ? 32 : card.colorsMask; // colorless spells → C slice
    for (const { bit, label } of COLOR_SLICES) {
      if (mask & bit) colorQty.set(label, (colorQty.get(label) ?? 0) + qty);
    }
  }

  return [
    {
      kind: "histogram",
      id: "mana-curve",
      title: "Mana curve",
      buckets: curve.map((value, mv) => ({ label: mv === 7 ? "7+" : String(mv), value })),
    },
    {
      kind: "breakdown",
      id: "types",
      title: "Card types",
      slices: [...typeQty.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([label, value]) => ({ label, value })),
    },
    {
      kind: "breakdown",
      id: "colors",
      title: "Colors",
      slices: COLOR_SLICES.filter((c) => colorQty.has(c.label)).map((c) => ({
        label: c.label,
        value: colorQty.get(c.label)!,
        colorVar: c.colorVar,
      })),
    },
    {
      kind: "stat",
      id: "avg-mv",
      title: "Avg. mana value",
      value: nonlandQty ? (mvSum / nonlandQty).toFixed(2) : "—",
      hint: "Nonland cards",
    },
    { kind: "stat", id: "lands", title: "Lands", value: String(landQty) },
    {
      kind: "stat",
      id: "price",
      title: "Est. price",
      value: `$${priceSum.toFixed(2)}`,
      hint:
        pricedQty < entries.reduce((n, e) => n + e.qty, 0)
          ? "Some cards unpriced"
          : "Cheapest printings",
    },
  ];
}
