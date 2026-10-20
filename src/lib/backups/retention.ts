/**
 * Backup retention (S6, SECURITY-AUDIT-report.md L17). The nightly writes
 * three objects per run under `pg/` in the private R2 bucket
 * (scripts/backup-user-tables.sh): the user-table dump, the identity map and
 * the account-links CSV, all stamped `YYYYMMDD-HHMM` in UTC. Nothing deleted
 * them, so "deletion is immediate and permanent" was true of the live
 * database and false of the bucket. The privacy page now says backups are
 * kept for BACKUP_RETENTION_DAYS days, and scripts/prune-backups.ts is what
 * makes that true — a rule in the repository that the VPS move keeps
 * (LATER.md row 279), not a bucket setting that would have to be recreated.
 *
 * The floor: the newest BACKUP_KEEP_NEWEST_STAMPS stamps are kept whatever
 * their age, so a nightly that stopped producing dumps can never prune the
 * bucket down to nothing, and a key that is not one of the three shapes is
 * never selected at all. Pure: the script lists, this selects, the script
 * deletes.
 */

export const BACKUP_RETENTION_DAYS = 35;
export const BACKUP_KEEP_NEWEST_STAMPS = 10;

/** The three objects one nightly run writes, as the backup script names them. */
const BACKUP_KEY =
  /^pg\/deckwarden-(?:user-tables|identity-map|account-links)-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})\.(?:sql|csv)\.gz$/;

export interface BackupStamp {
  /** `YYYYMMDD-HHMM`, the run the object belongs to. */
  stamp: string;
  /** The run's UTC time. */
  at: Date;
}

/** The run stamp of a backup object key, or null for any other key. */
export function backupStamp(key: string): BackupStamp | null {
  const m = BACKUP_KEY.exec(key);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const at = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
  if (Number.isNaN(at.getTime())) return null;
  return { stamp: `${y}${mo}${d}-${h}${mi}`, at };
}

export interface PruneSelection {
  /** Object keys to delete: every object of every expired stamp. */
  expired: string[];
  /** Stamps kept, newest first. */
  kept: string[];
  /** Stamps deleted, newest first. */
  deleted: string[];
  /** Keys under the prefix that are not backup objects — never touched. */
  unrecognized: number;
}

export interface PruneOptions {
  retentionDays?: number;
  keepNewestStamps?: number;
}

/**
 * Which objects under `pg/` are past retention: a stamp expires when it is
 * older than `retentionDays` AND not among the `keepNewestStamps` newest.
 */
export function selectExpiredBackups(
  keys: readonly string[],
  now: Date,
  opts: PruneOptions = {},
): PruneSelection {
  const retentionDays = opts.retentionDays ?? BACKUP_RETENTION_DAYS;
  const keepNewest = opts.keepNewestStamps ?? BACKUP_KEEP_NEWEST_STAMPS;
  const cutoff = now.getTime() - retentionDays * 24 * 60 * 60 * 1000;

  const byStamp = new Map<string, { at: Date; keys: string[] }>();
  let unrecognized = 0;
  for (const key of keys) {
    const parsed = backupStamp(key);
    if (!parsed) {
      unrecognized += 1;
      continue;
    }
    const entry = byStamp.get(parsed.stamp) ?? { at: parsed.at, keys: [] };
    entry.keys.push(key);
    byStamp.set(parsed.stamp, entry);
  }

  const stamps = [...byStamp.entries()].sort((a, b) => b[1].at.getTime() - a[1].at.getTime());
  const kept: string[] = [];
  const deleted: string[] = [];
  const expired: string[] = [];
  stamps.forEach(([stamp, entry], index) => {
    if (index < keepNewest || entry.at.getTime() >= cutoff) {
      kept.push(stamp);
      return;
    }
    deleted.push(stamp);
    expired.push(...entry.keys);
  });
  return { expired, kept, deleted, unrecognized };
}

/** The counts-only lines the nightly prints (S1: the log is world-readable). */
export function pruneReportLines(
  selection: PruneSelection,
  opts: { apply: boolean; retentionDays?: number; keepNewestStamps?: number } = { apply: true },
): string[] {
  const retentionDays = opts.retentionDays ?? BACKUP_RETENTION_DAYS;
  const keepNewest = opts.keepNewestStamps ?? BACKUP_KEEP_NEWEST_STAMPS;
  const total = selection.kept.length + selection.deleted.length;
  return [
    `prune-backups: ${total} backup stamp(s) under pg/, ${selection.unrecognized} other object(s) left alone`,
    `  keeping ${selection.kept.length} stamp(s): the newest ${keepNewest} always, the rest while under ${retentionDays} days old`,
    `  ${opts.apply ? "deleting" : "would delete"} ${selection.deleted.length} stamp(s), ${selection.expired.length} object(s)`,
  ];
}
