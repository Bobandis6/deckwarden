/**
 * The advisory watch (S0, SECURITY-AUDIT-report.md H1): FAILS (exit 1) when a
 * repository-published GitHub security advisory of vercel/next.js or
 * better-auth/better-auth covers a version installed in this tree — a red
 * nightly is the alert channel, like the ruleset watch and the DB gauge.
 *
 * Why a second signal: `pnpm audit` reads the global GitHub Advisory Database,
 * which a repository-published advisory reaches days later. On 2026-10-18 the
 * three next.js advisories of 2026-10-14 (two critical RCEs, one high DoS)
 * were still absent from it, `pnpm audit` said clean on next 16.3.8, and
 * Dependabot had nothing to show. The repository feeds carry them the hour
 * they are published; this step reads those.
 *
 *   pnpm advisories:watch                                 the tree as installed
 *   pnpm advisories:watch next@16.3.8 better-auth@1.7.2   these versions instead (the proof run)
 *
 * Reads: `gh api repos/<repo>/security-advisories?state=published` (every page;
 * `gh` must be signed in — GH_TOKEN, which is github.token in Actions since
 * both repositories are public, or `gh auth login` locally) and
 * `pnpm list --depth Infinity --json` (every installed package, transitives
 * included, so the better-auth adapters and the @next/* packages count; the
 * tree is read as installed, so run it after `pnpm install`). The reading of
 * a maintainer-typed range is src/lib/advisories/version-range.ts; the
 * matching, and the accepted list below, src/lib/advisories/watch.ts. A range
 * the reader does not understand counts as covering, so the step fails and a
 * person reads it; a failure to reach GitHub fails the step too.
 */
import { execFileSync } from "node:child_process";

import {
  collectInstalled,
  formatHit,
  parseInstalledArg,
  watchAdvisories,
  type Advisory,
  type Installed,
} from "../src/lib/advisories/watch";

/** The repositories whose feeds are read. */
const WATCHED_REPOSITORIES = ["vercel/next.js", "better-auth/better-auth"];

/**
 * Advisories whose range covers an installed version but whose preconditions
 * this app does not have. Reported every night, never alarmed. Each has a
 * LATER.md row with its trigger (the first thing to re-read when a row's
 * package moves). Remove an entry the day its precondition appears.
 */
const ACCEPTED_ADVISORIES: Record<string, string> = {
  "GHSA-fmh4-wcc4-5jm3":
    "the organization plugin is not installed (src/lib/auth.ts: plugins: [nextCookies()] only) and no unverified user can hold a session here; the advisory's `>= 1.6.14` entry names no patched version — LATER.md row 271",
};

const MAX_BUFFER = 64 * 1024 * 1024;

function run(file: string, args: string[]): string {
  return execFileSync(file, args, { encoding: "utf8", maxBuffer: MAX_BUFFER });
}

function readAdvisories(repo: string): Advisory[] {
  const pages: unknown = JSON.parse(
    run("gh", [
      "api",
      "--paginate",
      "--slurp",
      `repos/${repo}/security-advisories?state=published&per_page=100`,
    ]),
  );
  if (!Array.isArray(pages)) throw new Error(`${repo}: unexpected feed shape`);
  return pages.flat() as Advisory[];
}

function readInstalled(assumed: string[]): Installed[] {
  if (assumed.length) return assumed.map(parseInstalledArg);
  return collectInstalled(JSON.parse(run("pnpm", ["list", "--depth", "Infinity", "--json"])));
}

function main() {
  const assumed = process.argv.slice(2);
  const installed = readInstalled(assumed);
  console.log(
    assumed.length
      ? `assuming ${installed.map((p) => `${p.name}@${p.version}`).join(", ")} (not the tree)`
      : `${installed.length} installed name@version pairs read from pnpm list`,
  );
  let alarms = 0;
  for (const repo of WATCHED_REPOSITORIES) {
    const advisories = readAdvisories(repo);
    const result = watchAdvisories(advisories, installed, ACCEPTED_ADVISORIES);
    for (const hit of result.alarms) console.error(`ADVISORY ${formatHit(hit)}`);
    for (const hit of result.accepted) {
      console.log(`accepted ${formatHit(hit)}\n         because ${hit.reason}`);
    }
    alarms += result.alarms.length;
    const scope = result.watched.length
      ? result.watched.join(", ")
      : "anything installed from this repository";
    console.log(
      result.alarms.length
        ? `${result.alarms.length} advisory match${result.alarms.length === 1 ? "" : "es"} from ${repo} (${advisories.length} published advisories read)`
        : `no advisory covers ${scope} (${advisories.length} published advisories read from ${repo})`,
    );
  }
  if (alarms) {
    console.error(
      `${alarms} advisory match${alarms === 1 ? "" : "es"} — upgrade within the major, or accept with a reason in scripts/advisory-watch.ts and a LATER.md row.`,
    );
    process.exitCode = 1;
  }
}

try {
  main();
} catch (err) {
  console.error(err);
  process.exit(1);
}
