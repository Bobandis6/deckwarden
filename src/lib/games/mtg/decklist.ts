/**
 * Decklist tokenizing/serializing for MTG. Parse only TOKENIZES — name → id
 * resolution is core's job (name_norm exact, then trgm fuzzy), via the one
 * shared normalizer. Accepts the common paste shapes: MTGO ("1 Sol Ring"),
 * Arena/Moxfield ("1 Sol Ring (C21) 263 *F*"), bare names, "1x" quantities,
 * section headers ("Commander:", "Deck", "Sideboard"), *CMDR* markers.
 */
import type { CardData, DeckSnapshot } from "../types";
import type { MtgAttrs } from "./attrs";

type MtgCard = CardData<MtgAttrs>;

interface ParsedLine {
  rawName: string;
  qty: number;
  zoneHint?: string;
  setHint?: string;
}

/** Header lines → the zoneHint core will match against ZoneDef ids. */
const HEADER_ZONES: Record<string, string> = {
  commander: "commander",
  commanders: "commander",
  deck: "main",
  main: "main",
  maindeck: "main",
  mainboard: "main",
  sideboard: "sideboard",
  maybeboard: "maybeboard",
  companion: "companion",
};

export function parseMtgDecklist(text: string): { lines: ParsedLine[]; warnings: string[] } {
  const lines: ParsedLine[] = [];
  const warnings: string[] = [];
  let currentZone: string | undefined;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;

    const header = HEADER_ZONES[line.replace(/:$/, "").toLowerCase()];
    if (header) {
      currentZone = header;
      continue;
    }
    // Moxfield's "About"/"Name …" preamble
    if (/^about$/i.test(line) || /^name\s/i.test(line)) continue;

    const qtyMatch = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    const qty = qtyMatch ? Number(qtyMatch[1]) : 1;
    let rest = qtyMatch ? qtyMatch[2] : line;
    let zoneHint = currentZone;

    if (/\*CMDR\*/i.test(rest)) {
      zoneHint = "commander";
      rest = rest.replace(/\*CMDR\*/gi, " ");
    }
    rest = rest.replace(/\*[A-Za-z]+\*/g, " "); // *F* foil etc.
    rest = rest.replace(/#[\w-]+/g, " "); // #tags

    // Trailing "(SET) 123" / "(SET)" — set + collector-number hints.
    let setHint: string | undefined;
    const setMatch = rest.match(/^(.*?)\s+\(([A-Za-z0-9]{2,6})\)(?:\s+[\w★†-]+)?\s*$/);
    if (setMatch) {
      rest = setMatch[1];
      setHint = setMatch[2].toLowerCase();
    }

    const rawName = rest.replace(/\s+/g, " ").trim();
    if (!rawName || qty < 1) {
      warnings.push(`Could not parse line: "${raw.trim()}"`);
      continue;
    }
    lines.push({
      rawName,
      qty,
      ...(zoneHint ? { zoneHint } : {}),
      ...(setHint ? { setHint } : {}),
    });
  }

  return { lines, warnings };
}

const ZONE_ORDER = ["commander", "main"];

/** Headers chosen so parseMtgDecklist maps them back to the same zone ids. */
const ZONE_HEADERS: Record<string, string> = { commander: "Commander", main: "Deck" };

export function serializeMtgDecklist(
  deck: DeckSnapshot,
  cards: ReadonlyMap<string, MtgCard>,
): string {
  const zoneIds = [
    ...ZONE_ORDER.filter((z) => deck.zones[z]),
    ...Object.keys(deck.zones).filter((z) => !ZONE_ORDER.includes(z)),
  ];
  const sections: string[] = [];
  for (const zoneId of zoneIds) {
    const entries = deck.zones[zoneId];
    if (!entries.length) continue;
    const header = ZONE_HEADERS[zoneId] ?? zoneId;
    const body = entries
      .map((e) => ({ qty: e.qty, name: cards.get(e.cardId)?.name ?? e.cardId }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((e) => `${e.qty} ${e.name}`)
      .join("\n");
    sections.push(`${header}\n${body}`);
  }
  return sections.join("\n\n") + "\n";
}
