// @vitest-environment node
/**
 * No control bytes in the source tree (S8, SECURITY-AUDIT-report.md L15).
 * Four files used a raw NUL as a map-key separator; the byte was harmless at
 * runtime (zone ids and uuids never contain it) but `grep` skipped the files,
 * `file` called them data and git showed two of them as binary in every
 * diff — a review blind spot that produced seven false positives in the
 * audit's own scan. They spell it `\u0000` now (the same runtime value; the
 * existing tests prove the behaviour), and this test keeps any byte below
 * 0x20 other than tab, LF and CR out of every text file under `src`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(process.cwd(), "src");

/** The text files under src; the two icons (.ico, .png) are bytes by nature and stay out. */
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".css", ".json", ".svg", ".md", ".mjs", ".js"]);

const ALLOWED = new Set([0x09, 0x0a, 0x0d]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir).sort()) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (TEXT_EXTENSIONS.has(extname(name))) out.push(path);
  }
  return out;
}

/** The first disallowed byte in a file, with its line, or null. */
function firstControlByte(bytes: Buffer): { line: number; byte: number } | null {
  let line = 1;
  for (const byte of bytes) {
    if (byte === 0x0a) line++;
    else if (byte < 0x20 && !ALLOWED.has(byte)) return { line, byte };
  }
  return null;
}

const NUL_SEPARATOR_FILES = [
  "src/lib/decks/cards.ts",
  "src/lib/decks/editor-state.ts",
  "src/app/api/decks/autofill/route.ts",
  "src/components/editor/autofill-sheet.tsx",
];

describe("the source tree (SECURITY-AUDIT-report.md L15)", () => {
  const files = walk(ROOT);

  it("is walked (a guard that checks nothing would pass for the wrong reason)", () => {
    expect(files.length).toBeGreaterThan(600);
    expect(files).toContain(join(ROOT, "lib", "decks", "cards.ts"));
  });

  it("holds no byte below 0x20 other than tab, LF and CR in any text file", () => {
    const offenders = files.flatMap((file) => {
      const hit = firstControlByte(readFileSync(file));
      if (!hit) return [];
      const hex = hit.byte.toString(16).padStart(2, "0");
      return [`${relative(process.cwd(), file)}:${hit.line} byte 0x${hex}`];
    });
    expect(offenders).toEqual([]);
  });

  it.each(NUL_SEPARATOR_FILES)("%s spells its map-key separator as \\u0000", (file) => {
    const text = readFileSync(join(process.cwd(), file), "utf8");
    expect(text).toContain("\\u0000");
    expect(text).not.toContain("\u0000");
  });
});
