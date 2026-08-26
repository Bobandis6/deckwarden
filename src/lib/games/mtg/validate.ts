/**
 * Commander deck validation. Pure — runs client-side in the editor and
 * server-side on save (build plan §3).
 *
 * Legality inputs arrive pre-filtered by the core to the deck's format+date,
 * exceptions only (empty array = the format's default, which for Commander is
 * `legal`). Preview cards turn not_legal into a NOT_RELEASED *warning*.
 */
import type { CardData, DeckSnapshot, ValidationIssue, ZoneDef } from "../types";
import type { MtgAttrs } from "./attrs";
import { mtgFormat } from "./formats";

type MtgCard = CardData<MtgAttrs>;

/**
 * Hand-maintained commander-eligibility exceptions (build plan Appendix B note:
 * don't schema-tize). `is_leader_candidate` from ingest already covers legendary
 * creatures and printed "can be your commander" text; names here are normalized
 * front-face names for the rare card neither rule catches.
 */
const COMMANDER_EXCEPTION_NAMES: ReadonlySet<string> = new Set([]);

const WORD_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
};

/** Per-name copy limit; Infinity = unlimited (basics, Relentless Rats effects). */
export function copyLimit(card: MtgCard): number {
  if (/\bBasic\b/.test(card.attrs.type_line)) return Infinity;
  const text = card.attrs.oracle_text;
  if (/a deck can have any number of cards named/i.test(text)) return Infinity;
  const upTo = text.match(/a deck can have up to (\w+) cards named/i);
  if (upTo) return WORD_NUM[upTo[1].toLowerCase()] ?? 1;
  return 1;
}

function frontName(card: MtgCard): string {
  return card.name.split(" // ")[0];
}

function isEligibleCommander(card: MtgCard): boolean {
  return card.isLeaderCandidate || COMMANDER_EXCEPTION_NAMES.has(frontName(card).toLowerCase());
}

function keywords(card: MtgCard): string[] {
  return card.attrs.keywords ?? [];
}

/**
 * Two-commander pairing legality — MTG-adapter logic, hand-maintained
 * (Partner, Partner with, Friends forever, Choose a Background, Doctor's
 * companion), per the Appendix B note.
 */
export function isLegalPair(a: MtgCard, b: MtgCard): boolean {
  const kwA = keywords(a);
  const kwB = keywords(b);
  if (kwA.includes("Partner") && kwB.includes("Partner")) return true;
  if (kwA.includes("Friends forever") && kwB.includes("Friends forever")) return true;
  if (
    a.attrs.oracle_text.includes(`Partner with ${frontName(b)}`) &&
    b.attrs.oracle_text.includes(`Partner with ${frontName(a)}`)
  )
    return true;
  const background = (x: MtgCard, y: MtgCard) =>
    /choose a background/i.test(x.attrs.oracle_text) && y.attrs.type_line.includes("Background");
  if (background(a, b) || background(b, a)) return true;
  const companion = (x: MtgCard, y: MtgCard) =>
    keywords(x).includes("Doctor's companion") && y.attrs.type_line.includes("Time Lord Doctor");
  if (companion(a, b) || companion(b, a)) return true;
  return false;
}

/** Most severe legality problem for one card, or null. */
function legalityIssue(card: MtgCard): { code: string; severity: "error" | "warning" } | null {
  let notLegal = false;
  for (const entry of card.legality) {
    // MTG has no conditional bans today; skip conditions we don't interpret.
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

export function validateMtg(
  deck: DeckSnapshot,
  cards: ReadonlyMap<string, MtgCard>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const format = mtgFormat(deck.formatCode);
  if (!format) {
    return [
      {
        code: "FORMAT_UNKNOWN",
        severity: "error",
        message: `Unknown MTG format "${deck.formatCode}".`,
      },
    ];
  }
  const zoneDefs = new Map<string, ZoneDef>(format.zones.map((z) => [z.id, z]));

  const unknownCardIds: string[] = [];
  const qtyByCard = new Map<string, number>(); // across counted zones, for copy limits
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
      const bound = zone.max == null ? `at least ${zone.min}` : `${zone.min}–${zone.max}`;
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
    const want =
      format.deckSize.max === format.deckSize.min
        ? `exactly ${format.deckSize.min}`
        : `${format.deckSize.min}–${format.deckSize.max ?? "∞"}`;
    issues.push({
      code: "DECK_SIZE",
      severity: "error",
      message: `${format.label} decks are ${want} cards (has ${deckSize}).`,
    });
  }

  // --- Commander zone specifics ---------------------------------------------
  const commanders = (deck.zones["commander"] ?? [])
    .map((e) => cards.get(e.cardId))
    .filter((c): c is MtgCard => c != null);

  const ineligible = commanders.filter((c) => !isEligibleCommander(c));
  if (ineligible.length) {
    issues.push({
      code: "COMMANDER_INELIGIBLE",
      severity: "error",
      message: `${ineligible.map((c) => c.name).join(", ")} can't be your commander.`,
      cardIds: ineligible.map((c) => c.id),
      zone: "commander",
    });
  }

  if (commanders.length === 2 && !isLegalPair(commanders[0], commanders[1])) {
    issues.push({
      code: "COMMANDER_PAIR",
      severity: "error",
      message: `${commanders[0].name} and ${commanders[1].name} can't be commanders together (no Partner/Background pairing).`,
      cardIds: commanders.map((c) => c.id),
      zone: "commander",
    });
  }

  // --- Color identity: (ci & ~commanderCi) === 0 -----------------------------
  const commanderCi = commanders.reduce((mask, c) => mask | c.ciMask, 0);
  if (commanders.length) {
    const outside: string[] = [];
    for (const entry of deck.zones["main"] ?? []) {
      const card = cards.get(entry.cardId);
      if (card && (card.ciMask & ~commanderCi) !== 0) outside.push(card.id);
    }
    if (outside.length) {
      issues.push({
        code: "COLOR_IDENTITY",
        severity: "error",
        message: `${outside.length} card(s) are outside the commander's color identity.`,
        cardIds: outside,
        zone: "main",
      });
    }
  }

  // --- Copy limits (counted across zones so commander+main duplicates trip) --
  for (const [cardId, qty] of qtyByCard) {
    const card = cards.get(cardId);
    if (!card) continue;
    const limit = copyLimit(card);
    if (qty > limit) {
      issues.push({
        code: "COPY_LIMIT",
        severity: "error",
        message: `${card.name}: ${qty} copies (limit ${limit}).`,
        cardIds: [cardId],
      });
    }
  }

  // --- Legality (bans / not-yet-released) ------------------------------------
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
    BANNED: { severity: "error", msg: (n) => `${n} card(s) are banned in ${format.label}.` },
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

  return issues;
}
