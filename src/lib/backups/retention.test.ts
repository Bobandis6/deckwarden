/**
 * Backup retention (S6, L17): the selection the nightly prune runs over the
 * `pg/` listing, and the workflow that runs it with no dry-run variable.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BACKUP_KEEP_NEWEST_STAMPS,
  BACKUP_RETENTION_DAYS,
  backupStamp,
  pruneReportLines,
  selectExpiredBackups,
} from "./retention";

/** The three objects of one run, as scripts/backup-user-tables.sh names them. */
function run(stamp: string): string[] {
  return [
    `pg/deckwarden-user-tables-${stamp}.sql.gz`,
    `pg/deckwarden-identity-map-${stamp}.csv.gz`,
    `pg/deckwarden-account-links-${stamp}.csv.gz`,
  ];
}

/** `YYYYMMDD-HHMM` for `daysAgo` days before `now`, at the nightly's hour. */
function stampDaysAgo(now: Date, daysAgo: number): string {
  const at = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${at.getUTCFullYear()}${p(at.getUTCMonth() + 1)}${p(at.getUTCDate())}-${p(at.getUTCHours())}${p(at.getUTCMinutes())}`;
}

const NOW = new Date("2026-10-21T10:40:00.000Z");

describe("backupStamp", () => {
  it("reads the run stamp of each of the three object shapes", () => {
    for (const key of run("20261020-1525")) {
      expect(backupStamp(key)).toEqual({
        stamp: "20261020-1525",
        at: new Date("2026-10-20T15:25:00.000Z"),
      });
    }
  });

  it("is null for anything else under the prefix", () => {
    for (const key of [
      "pg/",
      "pg/notes.txt",
      "pg/deckwarden-user-tables-latest.sql.gz",
      "pg/deckwarden-user-tables-20261020-1525.sql",
      "pg/deckwarden-something-20261020-1525.sql.gz",
      "optcg/images/OP15-058.png",
      "deckwarden-user-tables-20261020-1525.sql.gz",
    ]) {
      expect(backupStamp(key), key).toBeNull();
    }
  });
});

describe("selectExpiredBackups", () => {
  it("keeps every stamp under the retention window and expires the older ones, all three objects at once", () => {
    const fresh = [stampDaysAgo(NOW, 1), stampDaysAgo(NOW, 20), stampDaysAgo(NOW, 34)];
    const old = [stampDaysAgo(NOW, 36), stampDaysAgo(NOW, 58)];
    const keys = [...fresh, ...old].flatMap(run);
    const selection = selectExpiredBackups(keys, NOW, { keepNewestStamps: 1 });
    expect(selection.kept).toEqual(fresh);
    expect(selection.deleted).toEqual(old);
    expect(selection.expired).toEqual(old.flatMap(run));
    expect(selection.unrecognized).toBe(0);
  });

  it("never prunes below the newest stamps, whatever their age (a nightly that stopped cannot empty the bucket)", () => {
    const stamps = Array.from({ length: 14 }, (_, i) => stampDaysAgo(NOW, 40 + i));
    const selection = selectExpiredBackups(stamps.flatMap(run), NOW);
    expect(selection.kept).toEqual(stamps.slice(0, BACKUP_KEEP_NEWEST_STAMPS));
    expect(selection.deleted).toEqual(stamps.slice(BACKUP_KEEP_NEWEST_STAMPS));
    expect(selection.expired).toHaveLength(4 * 3);
  });

  it("leaves unrecognized keys alone and counts them", () => {
    const selection = selectExpiredBackups(
      ["pg/notes.txt", "pg/deckwarden-user-tables-latest.sql.gz", ...run(stampDaysAgo(NOW, 100))],
      NOW,
      { keepNewestStamps: 0 },
    );
    expect(selection.unrecognized).toBe(2);
    expect(selection.expired).toEqual(run(stampDaysAgo(NOW, 100)));
  });

  it("an empty listing selects nothing", () => {
    expect(selectExpiredBackups([], NOW)).toEqual({
      expired: [],
      kept: [],
      deleted: [],
      unrecognized: 0,
    });
  });

  it("the defaults are the privacy page's number and the floor", () => {
    expect(BACKUP_RETENTION_DAYS).toBe(35);
    expect(BACKUP_KEEP_NEWEST_STAMPS).toBe(10);
    // Exactly 35 days old is still inside the window; a minute older is not.
    const edge = stampDaysAgo(NOW, 35);
    const past = stampDaysAgo(new Date(NOW.getTime() - 60_000), 35);
    const selection = selectExpiredBackups([...run(edge), ...run(past)], NOW, {
      keepNewestStamps: 0,
    });
    expect(selection.kept).toEqual([edge]);
    expect(selection.deleted).toEqual([past]);
  });
});

describe("pruneReportLines", () => {
  it("prints counts only — no key, no stamp", () => {
    const selection = selectExpiredBackups(
      [...run("20261020-1525"), ...run("20260823-1030"), "pg/notes.txt"],
      NOW,
      { keepNewestStamps: 1 },
    );
    const lines = pruneReportLines(selection, { apply: true });
    expect(lines).toEqual([
      "prune-backups: 2 backup stamp(s) under pg/, 1 other object(s) left alone",
      "  keeping 1 stamp(s): the newest 10 always, the rest while under 35 days old",
      "  deleting 1 stamp(s), 3 object(s)",
    ]);
    expect(lines.join("\n")).not.toMatch(/2026\d{4}/);
    expect(pruneReportLines(selection, { apply: false })[2]).toBe(
      "  would delete 1 stamp(s), 3 object(s)",
    );
  });
});

describe("the nightly workflow", () => {
  const nightly = readFileSync(join(process.cwd(), ".github/workflows/nightly-ingest.yml"), "utf8");

  it("runs the prune after the backup, with the R2 secrets and no dry-run variable", () => {
    const backup = nightly.indexOf("bash scripts/backup-user-tables.sh");
    const prune = nightly.indexOf("pnpm backups:prune");
    expect(backup).toBeGreaterThan(-1);
    expect(prune).toBeGreaterThan(backup);
    // Named in a comment there, set nowhere: no `BACKUP_PRUNE_DRY_RUN:` env line.
    expect(nightly).not.toMatch(/^\s*BACKUP_PRUNE_DRY_RUN:/m);
    const step = nightly.slice(prune, prune + 400);
    for (const secret of ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"]) {
      expect(step).toContain(`${secret}: \${{ secrets.${secret} }}`);
    }
  });
});
