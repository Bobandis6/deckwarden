/**
 * Collection CSV parsing (P3.7) — a PURE core: text in, normalized rows +
 * per-line rejects out. Runs in the browser (the /account import section
 * parses before it POSTs) and in vitest against REAL header rows captured
 * from live exports (parse.test.ts). No IO, no Date, no randomness.
 *
 * Two formats, detected by header row (case-insensitive, order-tolerant,
 * BOM-tolerant, extra columns ignored):
 *
 *   ManaBox — "Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,
 *   ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,
 *   Purchase price currency" (newer exports prepend "Binder Name,Binder Type").
 *   Foil is normal|foil|etched; set codes are UPPERCASE; Scryfall ID is the
 *   English printing's id whatever the Language column says — so a row
 *   resolves by id first (exact printing) and by set + number as fallback.
 *
 *   Moxfield — "Count","Tradelist Count","Name","Edition","Condition",
 *   "Language","Foil","Tags","Last Modified","Collector Number","Alter",
 *   "Proxy","Purchase Price" (every field quoted in real exports; some
 *   re-exports drop columns and quotes). Foil is ""|foil|etched; Edition is
 *   the lowercase Scryfall set code; Proxy=True rows are not owned cards.
 *
 * The CSV tokenizer is RFC 4180-shaped: quoted fields, doubled quotes,
 * embedded newlines inside quotes, CRLF/CR/LF, a missing final newline.
 * Anything the format promises but a line breaks is a REJECT with a reason
 * and its line number — never a silent drop (the plan's "do it cleanly").
 */
import { COLLECTION_LIMITS, type CollectionRow, type Finish } from "./types";

export type CollectionCsvFormat = "manabox" | "moxfield";

export type RejectReason = "no-name" | "bad-quantity" | "too-few-columns";

export interface ParseReject {
  /** 1-based line number in the file (the header is line 1). */
  line: number;
  reason: RejectReason;
  /** The offending line, trimmed, for the review list. */
  text: string;
}

/** A parsed line: a CollectionRow plus the read-only extras worth previewing. */
export interface ParsedRow extends CollectionRow {
  line: number;
  language?: string;
}

export interface ParseResult {
  format: CollectionCsvFormat;
  rows: ParsedRow[];
  rejects: ParseReject[];
  /** Data lines seen (header, blank and delimiter-only lines excluded). */
  lineCount: number;
  /** Blank / delimiter-only lines skipped (Moxfield re-exports have them). */
  blankLines: number;
  /** Finish cells nobody recognized — stored as nonfoil, disclosed. */
  unknownFinishes: { count: number; examples: string[] };
  /** Moxfield Proxy=True lines — not owned cards, skipped, disclosed. */
  proxiesSkipped: number;
  /** Quantities above COLLECTION_LIMITS.maxQuantity, clamped down, disclosed. */
  quantityClamped: number;
}

export type ParseOutcome =
  { ok: true; result: ParseResult } | { ok: false; error: string; header: string[] };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RFC 4180-shaped tokenizer. Returns one string[] per record; records are
 * split on CRLF, LF, or CR outside quotes. A trailing newline does not
 * produce an empty final record.
 */
export function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; // UTF-8 BOM
  const n = text.length;
  while (i < n) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      quoted = true;
      i++;
      continue;
    }
    if (ch === ",") {
      record.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\r" || ch === "\n") {
      record.push(field);
      records.push(record);
      record = [];
      field = "";
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    field += ch;
    i++;
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

const norm = (cell: string) => cell.trim().toLowerCase();

/**
 * Which app wrote the file. ManaBox is unmistakable by its id columns;
 * Moxfield by "Count" + "Edition" (its name for the set code). Nothing else
 * is claimed — a Deckbox/Archidekt/TCGplayer export gets an honest "not a
 * ManaBox or Moxfield export" instead of a guessed mapping.
 */
export function detectCollectionFormat(header: readonly string[]): CollectionCsvFormat | null {
  const cols = new Set(header.map(norm));
  if (cols.has("scryfall id") || cols.has("manabox id")) return "manabox";
  if (cols.has("count") && cols.has("edition")) return "moxfield";
  return null;
}

/**
 * Finish vocabulary across both apps plus the obvious human spellings:
 * ManaBox writes normal|foil|etched, Moxfield ""|foil|etched. Anything
 * else is nonfoil with `known: false` so the caller can count it.
 */
export function normalizeFinish(cell: string): { finish: Finish; known: boolean } {
  switch (norm(cell)) {
    case "":
    case "normal":
    case "nonfoil":
    case "non-foil":
    case "non foil":
    case "regular":
    case "no":
    case "false":
    case "0":
      return { finish: "nonfoil", known: true };
    case "foil":
    case "yes":
    case "true":
    case "1":
      return { finish: "foil", known: true };
    case "etched":
    case "etched foil":
      return { finish: "etched", known: true };
    default:
      return { finish: "nonfoil", known: false };
  }
}

/** "2" / "2.0" / " 12 " → integer; anything else null. */
function parseQuantity(cell: string): number | null {
  const m = /^\s*(\d{1,7})(?:\.0+)?\s*$/.exec(cell);
  return m ? Number(m[1]) : null;
}

const TRUTHY = new Set(["true", "yes", "1"]);

interface ColumnMap {
  name: number;
  quantity: number;
  finish: number | undefined;
  scryfallId: number | undefined;
  setCode: number | undefined;
  collectorNumber: number | undefined;
  language: number | undefined;
  proxy: number | undefined;
}

function columnsFor(format: CollectionCsvFormat, header: readonly string[]): ColumnMap | string {
  const index = new Map<string, number>();
  header.forEach((h, i) => {
    const key = norm(h);
    if (!index.has(key)) index.set(key, i);
  });
  const col = (...names: string[]) => {
    for (const name of names) {
      const i = index.get(name);
      if (i !== undefined) return i;
    }
    return undefined;
  };
  const name = col("name", "card name");
  const quantity = format === "manabox" ? col("quantity", "count") : col("count", "quantity");
  if (name === undefined) return `The header has no "Name" column.`;
  if (quantity === undefined) {
    return format === "manabox"
      ? `The header has no "Quantity" column.`
      : `The header has no "Count" column.`;
  }
  return {
    name,
    quantity,
    finish: col("foil", "finish"),
    scryfallId: format === "manabox" ? col("scryfall id") : col("scryfall id"),
    setCode: format === "manabox" ? col("set code", "edition") : col("edition", "set code"),
    collectorNumber: col("collector number", "collector no", "number"),
    language: col("language"),
    proxy: format === "moxfield" ? col("proxy") : undefined,
  };
}

/** Parse a whole export. The header row decides the format; every data line is kept or rejected with a reason. */
export function parseCollectionCsv(text: string): ParseOutcome {
  const records = parseCsv(text);
  const headerIdx = records.findIndex((r) => r.some((c) => c.trim() !== ""));
  if (headerIdx === -1) return { ok: false, error: "The file is empty.", header: [] };
  const header = records[headerIdx].map((h) => h.trim());
  const format = detectCollectionFormat(header);
  if (!format) {
    return {
      ok: false,
      error:
        "This doesn't look like a ManaBox or Moxfield collection export — the header row names neither a Scryfall ID nor Count + Edition columns.",
      header,
    };
  }
  const cols = columnsFor(format, header);
  if (typeof cols === "string") return { ok: false, error: cols, header };

  const rows: ParsedRow[] = [];
  const rejects: ParseReject[] = [];
  const unknownFinishExamples: string[] = [];
  let unknownFinishes = 0;
  let proxiesSkipped = 0;
  let quantityClamped = 0;
  let blankLines = 0;
  let lineCount = 0;
  const needed = Math.max(cols.name, cols.quantity) + 1;

  for (let r = headerIdx + 1; r < records.length; r++) {
    const cells = records[r];
    const line = r + 1;
    if (cells.every((c) => c.trim() === "")) {
      blankLines++;
      continue;
    }
    lineCount++;
    const text = cells.join(",").trim();
    if (cells.length < needed) {
      rejects.push({ line, reason: "too-few-columns", text });
      continue;
    }
    const cell = (i: number | undefined) => (i === undefined ? "" : (cells[i] ?? ""));
    const name = cell(cols.name).replace(/\s+/g, " ").trim();
    if (!name) {
      rejects.push({ line, reason: "no-name", text });
      continue;
    }
    let quantity = parseQuantity(cell(cols.quantity));
    if (quantity === null || quantity < 1) {
      rejects.push({ line, reason: "bad-quantity", text });
      continue;
    }
    if (TRUTHY.has(norm(cell(cols.proxy)))) {
      proxiesSkipped++;
      continue;
    }
    if (quantity > COLLECTION_LIMITS.maxQuantity) {
      quantity = COLLECTION_LIMITS.maxQuantity;
      quantityClamped++;
    }
    const finishCell = cell(cols.finish);
    const { finish, known } = normalizeFinish(finishCell);
    if (!known) {
      unknownFinishes++;
      if (unknownFinishExamples.length < 5 && !unknownFinishExamples.includes(finishCell.trim())) {
        unknownFinishExamples.push(finishCell.trim());
      }
    }
    const scryfallRaw = cell(cols.scryfallId).trim();
    const scryfallId = UUID_RE.test(scryfallRaw) ? scryfallRaw.toLowerCase() : undefined;
    const setCode = cell(cols.setCode).trim().toLowerCase().slice(0, COLLECTION_LIMITS.setCodeMax);
    const collectorNumber = cell(cols.collectorNumber)
      .trim()
      .slice(0, COLLECTION_LIMITS.collectorNumberMax);
    const language = cell(cols.language).trim();
    rows.push({
      line,
      name: name.slice(0, COLLECTION_LIMITS.nameMax),
      ...(scryfallId ? { scryfallId } : {}),
      ...(setCode ? { setCode } : {}),
      ...(collectorNumber ? { collectorNumber } : {}),
      ...(language ? { language } : {}),
      finish,
      quantity,
    });
  }

  return {
    ok: true,
    result: {
      format,
      rows,
      rejects,
      lineCount,
      blankLines,
      unknownFinishes: { count: unknownFinishes, examples: unknownFinishExamples },
      proxiesSkipped,
      quantityClamped,
    },
  };
}

export const REJECT_LABELS: Record<RejectReason, string> = {
  "no-name": "no card name",
  "bad-quantity": "quantity isn't a positive whole number",
  "too-few-columns": "line has fewer columns than the header",
};

/** Copyable reject list: one line per reject, "line N — reason: text". */
export function formatRejects(rejects: readonly ParseReject[]): string {
  return rejects.map((r) => `line ${r.line} — ${REJECT_LABELS[r.reason]}: ${r.text}`).join("\n");
}
