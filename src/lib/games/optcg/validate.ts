/**
 * One Piece TCG deck validation (P4.2). Pure — runs client-side in the editor
 * and server-side on save, the same seam as mtg/validate.ts.
 *
 * Rules verified against the official Comprehensive Rules (2026-08-28 PDF):
 *  - 5-1-2-2: "Only cards of a color included on the Leader card can be
 *    included in a deck. Cards of a color not included on the Leader card
 *    cannot be added to the deck." — i.e. ALL of a card's colors must appear
 *    on the leader, which is exactly the mask fit test (ci & ~leaderCi) === 0.
 *  - 5-1-2-3: "A deck can contain no more than 4 cards with the same card
 *    number." — the copy cap is per identity (external_key IS the card
 *    number), not per name; OP has 1,615 duplicate names.
 *  - 5-1-2-1: the 50-card deck holds Character/Event/Stage cards only, so a
 *    Leader-category card in the main zone is its own error.
 *
 * Legality entries arrive pre-filtered to the format, exceptions only (empty
 * = the format default, `legal` for optcg standard). Unconditional `banned`
 * rows are Bandai's Banned Cards; `restricted` means limit-1 (no cards carry
 * it today — Bandai's list says "There are currently no cards in this
 * category" — but the semantic ships tested); `banned_with` conditions are
 * the Banned Pair Cards, mirrored on both partners (types.ts LegalityEntry).
 */
import type { CardData, DeckSnapshot, ValidationIssue, ZoneDef } from "../types";
import type { OptcgAttrs } from "./adapter";

type OptcgCard = CardData<OptcgAttrs>;

/** Per-card-number copy limit: 4, or 1 while a `restricted` row is in force. */
function copyLimit(card: OptcgCard, fallback: number): number {
  for (const entry of card.legality) {
    if (!entry.condition && entry.status === "restricted") return 1;
  }
  return fallback;
}

/** Most severe unconditional legality problem for one card, or null. */
function legalityIssue(card: OptcgCard): { code: string; severity: "error" | "warning" } | null {
  let notLegal = false;
  for (const entry of card.legality) {
    // Conditional rows (pair bans) are handled by the pair pass below.
    if (entry.condition) continue;
    if (entry.status === "banned") return { code: "BANNED", severity: "error" };
    if (entry.status === "not_legal") notLegal = true;
  }
  if (notLegal) {
    return card.isPreview
      ? { code: "NOT_RELEASED", severity: "warning" }
      : { code: "NOT_LEGAL", severity: "error" };
  }
  return null;
}

export function validateOptcg(
  deck: DeckSnapshot,
  cards: ReadonlyMap<string, OptcgCard>,
  format: {
    code: string;
    label: string;
    zones: ZoneDef[];
    deckSize: { min: number; max: number | null };
  },
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const zoneDefs = new Map<string, ZoneDef>(format.zones.map((z) => [z.id, z]));

  const unknownCardIds: string[] = [];
  const qtyByCard = new Map<string, number>(); // across zones — the card-number cap
  let deckSize = 0;

  for (const [zoneId, entries] of Object.entries(deck.zones)) {
    const zone = zoneDefs.get(zoneId);
    if (!zone) {
      issues.push({
        code: "ZONE_UNKNOWN",
        severity: "error",
        message: `"${zoneId}" is not a ${format.label} zone.`,
        zone: zoneId,
      });
      continue;
    }
    let zoneQty = 0;
    for (const entry of entries) {
      zoneQty += entry.qty;
      qtyByCard.set(entry.cardId, (qtyByCard.get(entry.cardId) ?? 0) + entry.qty);
      if (!cards.has(entry.cardId)) unknownCardIds.push(entry.cardId);
    }
    if (zone.countsTowardSize) deckSize += zoneQty;
    if (zoneQty < zone.min || (zone.max != null && zoneQty > zone.max)) {
      const bound =
        zone.max === zone.min ? `exactly ${zone.min}` : `${zone.min}–${zone.max ?? "∞"}`;
      issues.push({
        code: "ZONE_SIZE",
        severity: "error",
        message: `${zone.label} must have ${bound} card${zone.max === 1 ? "" : "s"} (has ${zoneQty}).`,
        zone: zoneId,
      });
    }
  }

  if (unknownCardIds.length) {
    issues.push({
      code: "UNKNOWN_CARD",
      severity: "error",
      message: `${unknownCardIds.length} card(s) could not be found.`,
      cardIds: unknownCardIds,
    });
  }

  if (
    deckSize < format.deckSize.min ||
    (format.deckSize.max != null && deckSize > format.deckSize.max)
  ) {
    issues.push({
      code: "DECK_SIZE",
      severity: "error",
      message: `${format.label} decks are exactly ${format.deckSize.min} cards plus your Leader (has ${deckSize}).`,
    });
  }

  // --- Leader zone specifics --------------------------------------------------
  const leaders = (deck.zones["leader"] ?? [])
    .map((e) => cards.get(e.cardId))
    .filter((c): c is OptcgCard => c != null);

  const ineligible = leaders.filter((c) => c.attrs.category !== "leader");
  if (ineligible.length) {
    issues.push({
      code: "LEADER_INELIGIBLE",
      severity: "error",
      message: `${ineligible.map((c) => c.name).join(", ")} is not a Leader card.`,
      cardIds: ineligible.map((c) => c.id),
      zone: "leader",
    });
  }

  // Rule 5-1-2-1: the deck is Characters, Events and Stages — never Leaders.
  const leadersInMain = (deck.zones["main"] ?? [])
    .map((e) => cards.get(e.cardId))
    .filter((c): c is OptcgCard => c != null && c.attrs.category === "leader");
  if (leadersInMain.length) {
    issues.push({
      code: "LEADER_IN_MAIN",
      severity: "error",
      message: `Leader cards can't go in the deck: ${leadersInMain.map((c) => c.name).join(", ")}.`,
      cardIds: leadersInMain.map((c) => c.id),
      zone: "main",
    });
  }

  // --- Leader-color legality: (ci & ~leaderCi) === 0 ---------------------------
  const leaderCi = leaders.reduce((mask, c) => mask | c.ciMask, 0);
  if (leaders.length) {
    const outside: string[] = [];
    for (const entry of deck.zones["main"] ?? []) {
      const card = cards.get(entry.cardId);
      if (card && (card.ciMask & ~leaderCi) !== 0) outside.push(card.id);
    }
    if (outside.length) {
      issues.push({
        code: "COLOR_IDENTITY",
        severity: "error",
        message: `${outside.length} card(s) are outside your Leader's colors.`,
        cardIds: outside,
        zone: "main",
      });
    }
  }

  // --- Copy limit: 4 per card number, across zones (rule 5-1-2-3) --------------
  for (const [cardId, qty] of qtyByCard) {
    const card = cards.get(cardId);
    if (!card) continue;
    const limit = copyLimit(card, 4);
    if (qty > limit) {
      issues.push({
        code: "COPY_LIMIT",
        severity: "error",
        message: `${card.name} (${card.externalKey}): ${qty} copies (limit ${limit}).`,
        cardIds: [cardId],
      });
    }
  }

  // --- Bans (unconditional rows) ------------------------------------------------
  const byCode = new Map<string, string[]>();
  for (const cardId of qtyByCard.keys()) {
    const card = cards.get(cardId);
    if (!card) continue;
    const problem = legalityIssue(card);
    if (problem) byCode.set(problem.code, [...(byCode.get(problem.code) ?? []), cardId]);
  }
  const legalityMessages: Record<
    string,
    { severity: "error" | "warning"; msg: (n: number) => string }
  > = {
    BANNED: { severity: "error", msg: (n) => `${n} card(s) are on Bandai's Banned Cards list.` },
    NOT_LEGAL: { severity: "error", msg: (n) => `${n} card(s) are not legal in ${format.label}.` },
    NOT_RELEASED: {
      severity: "warning",
      msg: (n) => `${n} preview card(s) — not legal until release.`,
    },
  };
  for (const [code, cardIds] of byCode) {
    const spec = legalityMessages[code];
    issues.push({ code, severity: spec.severity, message: spec.msg(cardIds.length), cardIds });
  }

  // --- Banned pairs (`banned_with` conditions, mirrored on both partners) ------
  // A pair fires when both cards are in the deck, leader zone included —
  // Bandai's wording is "cannot be included in the same deck". Mirrored rows
  // would report each pair twice; dedupe on the sorted external-key pair.
  const inDeckByKey = new Map<string, OptcgCard>();
  for (const cardId of qtyByCard.keys()) {
    const card = cards.get(cardId);
    if (card) inDeckByKey.set(card.externalKey.toUpperCase(), card);
  }
  const seenPairs = new Set<string>();
  for (const card of inDeckByKey.values()) {
    for (const entry of card.legality) {
      const cond = entry.condition;
      if (!cond || cond.type !== "banned_with" || !Array.isArray(cond.cardIds)) continue;
      for (const partnerKey of cond.cardIds as string[]) {
        const partner = inDeckByKey.get(partnerKey.toUpperCase());
        if (!partner || partner.id === card.id) continue;
        const pairKey = [card.externalKey, partner.externalKey].sort().join("+");
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        issues.push({
          code: "BANNED_PAIR",
          severity: "error",
          message: `${card.name} (${card.externalKey}) and ${partner.name} (${partner.externalKey}) can't be in the same deck (Bandai banned pair).`,
          cardIds: [card.id, partner.id],
        });
      }
    }
  }

  return issues;
}
