// @vitest-environment node
/**
 * The purge report (S1, SECURITY-AUDIT-report.md M2): the nightly's log is
 * public, so the default report carries counts only; ids and names print
 * behind PURGE_VERBOSE=1, which the nightly workflow never sets. The restore
 * drill's one SELECT over the restored decks is pinned aggregate-only here
 * too — the same finding, the same public log.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  purgeCandidateLine,
  purgeReportLines,
  summarizePurge,
  type PurgeCandidate,
  type PurgeReportOptions,
} from "./purge-report";

const OPTS: PurgeReportOptions = {
  apply: false,
  verbose: false,
  emptyAfter: "30 days",
  untouchedAfter: "12 months",
};

const SECRETS = {
  id: "9d1c6c0e-2f4b-4a35-9b0e-5f1d2c3b4a56",
  publicId: "7sm_66hjm3g4",
  name: "P1.3 Eyeball Deck",
};

function candidate(over: Partial<PurgeCandidate> = {}): PurgeCandidate {
  return {
    id: SECRETS.id,
    publicId: SECRETS.publicId,
    name: SECRETS.name,
    cardRows: 0,
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    updatedAt: new Date("2026-01-02T03:04:05.000Z"),
    reason: "empty",
    ...over,
  };
}

const ROWS: PurgeCandidate[] = [
  candidate(),
  candidate({ id: "b", publicId: "pshzt7a6pwjb", name: "Untitled", reason: "empty" }),
  candidate({ id: "c", publicId: "86vxk_qvpaj3", name: "Old", cardRows: 14, reason: "untouched" }),
];

describe("summarizePurge", () => {
  it("counts the candidates per reason", () => {
    expect(summarizePurge(ROWS)).toEqual({ candidates: 3, empty: 2, untouched: 1 });
    expect(summarizePurge([])).toEqual({ candidates: 0, empty: 0, untouched: 0 });
  });
});

describe("purgeReportLines", () => {
  it("dry run: counts per reason and the number it would delete, no id, public id or name", () => {
    const lines = purgeReportLines(ROWS, OPTS);
    expect(lines).toEqual([
      "purge-anon-decks: 3 candidate(s) — mode: dry-run",
      "  empty > 30 days: 2",
      "  untouched > 12 months: 1",
      "  would delete: 3",
      "  per-deck lines (ids, names) print only with PURGE_VERBOSE=1 — never in Actions, whose logs are public.",
    ]);
    const text = lines.join("\n");
    for (const secret of Object.values(SECRETS)) expect(text).not.toContain(secret);
    expect(text).not.toContain("pshzt7a6pwjb");
    expect(text).not.toContain("Untitled");
  });

  it("apply: the same counts, worded as a deletion", () => {
    const lines = purgeReportLines(ROWS, { ...OPTS, apply: true });
    expect(lines[0]).toBe("purge-anon-decks: 3 candidate(s) — mode: APPLY");
    expect(lines[3]).toBe("  deleting: 3");
    expect(lines.join("\n")).not.toContain(SECRETS.publicId);
  });

  it("no candidates: the four count lines and nothing else", () => {
    expect(purgeReportLines([], OPTS)).toEqual([
      "purge-anon-decks: 0 candidate(s) — mode: dry-run",
      "  empty > 30 days: 0",
      "  untouched > 12 months: 0",
      "  would delete: 0",
    ]);
  });

  it("verbose (PURGE_VERBOSE=1, local runs): one line per candidate after the counts", () => {
    const lines = purgeReportLines(ROWS, { ...OPTS, verbose: true });
    expect(lines).toHaveLength(4 + ROWS.length);
    expect(lines[4]).toBe(
      `  ${SECRETS.id}  ${SECRETS.publicId}  "${SECRETS.name}"  cards=0  created=2026-01-02T03:04:05.000Z  updated=2026-01-02T03:04:05.000Z  (empty > 30 days)`,
    );
    expect(lines[6]).toContain("(untouched > 12 months)");
    expect(lines.join("\n")).not.toContain("PURGE_VERBOSE");
  });

  it("the per-deck line names the reason with its window", () => {
    expect(purgeCandidateLine(candidate({ reason: "untouched" }), OPTS)).toMatch(
      /\(untouched > 12 months\)$/,
    );
    expect(purgeCandidateLine(candidate({ reason: "empty" }), OPTS)).toMatch(
      /\(empty > 30 days\)$/,
    );
  });
});

describe("the workflows (public logs)", () => {
  const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

  it("the nightly never sets PURGE_VERBOSE", () => {
    const nightly = read(".github/workflows/nightly-ingest.yml");
    expect(nightly).toContain("run: pnpm decks:purge");
    expect(nightly).not.toMatch(/^\s*PURGE_VERBOSE\s*:/m);
  });

  it("the restore drill prints no deck name: its decks SELECT is aggregate-only", () => {
    const drill = read(".github/workflows/restore-drill.yml");
    expect(drill).not.toMatch(/\bd\.name\b/);
    expect(drill).not.toMatch(/SELECT[^"]*\bname\b/);
    expect(drill).toMatch(/GROUP BY d\.kind, d\.visibility/);
  });
});
