/**
 * The advisory watch (S0, SECURITY-AUDIT-report.md H1) — pure: which
 * repository-published GitHub security advisories cover which installed
 * package versions. scripts/advisory-watch.ts reads the feeds with `gh api`
 * and the tree with `pnpm list`, hands both here, and exits 1 on any alarm so
 * the nightly goes red like the ruleset watch and the DB gauge.
 *
 * An advisory names its packages in `vulnerabilities[]`, one entry per
 * release line a maintainer wrote a range for. Every entry on the npm
 * ecosystem whose package is installed is read with version-range.ts; an
 * entry whose range cannot be read counts as covering (a person reads it).
 * Withdrawn advisories are skipped. `accepted` is the standing list of
 * advisories whose range covers an installed version but whose preconditions
 * the app does not have (a plugin it never installs) — each with its reason,
 * recorded in LATER.md with a trigger, like the `pnpm audit` rows 269/270;
 * they are reported, not alarmed.
 */
import { covers, formatVersion, parseVersion } from "./version-range";

export interface AdvisoryPackage {
  ecosystem: string | null;
  name: string | null;
}

export interface AdvisoryVulnerability {
  package: AdvisoryPackage | null;
  vulnerable_version_range: string | null;
  patched_versions: string | null;
}

/** The fields this watch reads of GET /repos/{owner}/{repo}/security-advisories. */
export interface Advisory {
  ghsa_id: string;
  severity: string | null;
  summary: string | null;
  html_url: string | null;
  published_at: string | null;
  withdrawn_at: string | null;
  vulnerabilities: AdvisoryVulnerability[] | null;
}

export interface Installed {
  name: string;
  version: string;
}

export interface Hit {
  ghsaId: string;
  severity: string;
  summary: string;
  url: string;
  name: string;
  version: string;
  range: string;
  patched: string;
  /** The range could not be read, so the entry counts as covering. */
  unparsed: boolean;
}

export interface AcceptedHit extends Hit {
  reason: string;
}

export interface WatchResult {
  alarms: Hit[];
  accepted: AcceptedHit[];
  /** Installed name@version pairs the feed's advisories name at all, covered or not. */
  watched: string[];
}

/**
 * Every installed package of the tree, once per distinct version, from
 * `pnpm list --depth Infinity --json` (an array of projects; each dependency
 * entry carries `version` and its own nested `dependencies`). Versions that
 * are not versions (`link:…`) are skipped.
 */
export function collectInstalled(pnpmListJson: unknown): Installed[] {
  const seen = new Map<string, Installed>();
  const walk = (deps: unknown) => {
    if (typeof deps !== "object" || deps === null) return;
    for (const [name, entry] of Object.entries(deps as Record<string, unknown>)) {
      if (typeof entry !== "object" || entry === null) continue;
      const node = entry as Record<string, unknown>;
      const version = typeof node.version === "string" ? node.version : null;
      if (version && parseVersion(version)) seen.set(`${name}@${version}`, { name, version });
      walk(node.dependencies);
      walk(node.devDependencies);
      walk(node.optionalDependencies);
    }
  };
  const projects = Array.isArray(pnpmListJson) ? pnpmListJson : [pnpmListJson];
  for (const project of projects) {
    if (typeof project !== "object" || project === null) continue;
    const node = project as Record<string, unknown>;
    walk(node.dependencies);
    walk(node.devDependencies);
    walk(node.optionalDependencies);
    walk(node.unsavedDependencies);
  }
  return [...seen.values()].sort((a, b) =>
    a.name === b.name ? a.version.localeCompare(b.version) : a.name.localeCompare(b.name),
  );
}

/** `name@version`, scoped names included (`@better-auth/core@1.7.10`). */
export function parseInstalledArg(arg: string): Installed {
  const at = arg.lastIndexOf("@");
  if (at <= 0 || at === arg.length - 1) {
    throw new Error(`expected name@version, got "${arg}"`);
  }
  const installed = { name: arg.slice(0, at), version: arg.slice(at + 1) };
  if (!parseVersion(installed.version)) throw new Error(`not a version: "${installed.version}"`);
  return installed;
}

export function watchAdvisories(
  advisories: Advisory[],
  installed: Installed[],
  accepted: Record<string, string> = {},
): WatchResult {
  const byName = new Map<string, Installed[]>();
  for (const pkg of installed) {
    const list = byName.get(pkg.name) ?? [];
    list.push(pkg);
    byName.set(pkg.name, list);
  }
  const alarms: Hit[] = [];
  const acceptedHits: AcceptedHit[] = [];
  const watched = new Set<string>();
  const reported = new Set<string>();
  for (const advisory of advisories) {
    if (advisory.withdrawn_at) continue;
    for (const entry of advisory.vulnerabilities ?? []) {
      if ((entry.package?.ecosystem ?? "").toLowerCase() !== "npm") continue;
      const name = entry.package?.name;
      if (!name) continue;
      for (const pkg of byName.get(name) ?? []) {
        const version = parseVersion(pkg.version);
        if (!version) continue;
        watched.add(`${pkg.name}@${pkg.version}`);
        const coverage = covers(version, entry.vulnerable_version_range, entry.patched_versions);
        if (!coverage.covered) continue;
        const key = `${advisory.ghsa_id} ${pkg.name}@${pkg.version}`;
        if (reported.has(key)) continue;
        reported.add(key);
        const hit: Hit = {
          ghsaId: advisory.ghsa_id,
          severity: advisory.severity ?? "unknown",
          summary: advisory.summary ?? "",
          url: advisory.html_url ?? `https://github.com/advisories/${advisory.ghsa_id}`,
          name: pkg.name,
          version: formatVersion(version),
          range: entry.vulnerable_version_range ?? "",
          patched: entry.patched_versions ?? "",
          unparsed: coverage.unparsed,
        };
        const reason = accepted[advisory.ghsa_id];
        if (reason) acceptedHits.push({ ...hit, reason });
        else alarms.push(hit);
      }
    }
  }
  return { alarms, accepted: acceptedHits, watched: [...watched].sort() };
}

/** One line per hit, the way the nightly log shows it. */
export function formatHit(hit: Hit): string {
  const how = hit.unparsed
    ? `range "${hit.range}" not understood — read it`
    : `range "${hit.range}"${hit.patched ? `, patched ${hit.patched}` : ", nothing patched"}`;
  return `${hit.ghsaId} (${hit.severity}) covers ${hit.name}@${hit.version}: ${hit.summary} — ${how} — ${hit.url}`;
}
