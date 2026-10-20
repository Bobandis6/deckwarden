/**
 * Backup retention (S6, SECURITY-AUDIT-report.md L17): delete the nightly
 * dumps under `pg/` that are older than BACKUP_RETENTION_DAYS, keeping the
 * newest BACKUP_KEEP_NEWEST_STAMPS runs whatever their age
 * (src/lib/backups/retention.ts has the rule and its tests). Runs right
 * after scripts/backup-user-tables.sh in the nightly, with the same R2
 * secrets and the same aws CLI, and skips cleanly without them. The privacy
 * page states the number; this is what makes it true.
 *
 * Counts only in the log (S1): the nightly runs in a public repository.
 * BACKUP_PRUNE_DRY_RUN=1 lists and deletes nothing — a local check, never
 * set by the workflow (retention.test.ts pins that).
 *
 *   pnpm backups:prune                         # prune
 *   BACKUP_PRUNE_DRY_RUN=1 pnpm backups:prune  # count only
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { pruneReportLines, selectExpiredBackups } from "../src/lib/backups/retention";

const run = promisify(execFile);

const PREFIX = "pg/";

function r2Env() {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    endpoint,
    bucket,
    env: { ...process.env, AWS_ACCESS_KEY_ID: accessKeyId, AWS_SECRET_ACCESS_KEY: secretAccessKey },
  };
}

/** Every key under the prefix, following the listing's continuation tokens. */
async function listKeys(r2: NonNullable<ReturnType<typeof r2Env>>): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const args = [
      "s3api",
      "list-objects-v2",
      "--bucket",
      r2.bucket,
      "--prefix",
      PREFIX,
      "--endpoint-url",
      r2.endpoint,
      "--output",
      "json",
      ...(token ? ["--continuation-token", token] : []),
    ];
    const { stdout } = await run("aws", args, { env: r2.env, maxBuffer: 64 * 1024 * 1024 });
    const page = (stdout.trim() ? JSON.parse(stdout) : {}) as {
      Contents?: Array<{ Key?: string }>;
      NextContinuationToken?: string;
    };
    for (const object of page.Contents ?? []) if (object.Key) keys.push(object.Key);
    token = page.NextContinuationToken;
  } while (token);
  return keys;
}

async function main() {
  const r2 = r2Env();
  if (!r2) {
    console.log(
      "R2 secrets not configured — skipping backup prune (nothing to prune without a bucket).",
    );
    return;
  }
  const apply = process.env.BACKUP_PRUNE_DRY_RUN !== "1";
  const keys = await listKeys(r2);
  const selection = selectExpiredBackups(keys, new Date());
  for (const line of pruneReportLines(selection, { apply })) console.log(line);
  if (!apply || selection.expired.length === 0) return;

  let deleted = 0;
  for (const key of selection.expired) {
    await run("aws", ["s3", "rm", `s3://${r2.bucket}/${key}`, "--endpoint-url", r2.endpoint], {
      env: r2.env,
    });
    deleted += 1;
  }
  console.log(`deleted ${deleted} object(s).`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
