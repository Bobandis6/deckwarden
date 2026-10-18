/**
 * Version ranges as GitHub repository advisories write them (S0,
 * SECURITY-AUDIT-report.md H1). A repository-published advisory's
 * `vulnerable_version_range` is text a maintainer typed, not the normalized
 * range the global Advisory Database publishes days later, so this reader
 * takes what the vercel/next.js and better-auth/better-auth feeds actually
 * hold (every range of both feeds, read 2026-10-18, parses):
 *
 *   `>= 1.4.0-beta.18, < 1.7.7`                  a comma joining a lower and an upper bound (AND)
 *   `>= 13.0.0 < 14.2.21, >= 15.0.0 < 15.1.1`    commas between complete ranges (OR)
 *   `<14.2.32, <15.4.7` · `>= 13.3, >= 14, >=15`  same-direction bounds, one per release line (OR)
 *   `< 14.2.31, 15.0.0 - 15.4.4`                 a hyphen range
 *   `<14.2.24, >15.0.0 and <15.1.6`              the word `and`
 *   `=> 11.1.4 < 12.3.5` · `>= v12.2.0`          `=>` for `>=`, a `v` prefix
 *   `=>14.0 <14.2.25` · `>= 13.3`                two-component versions
 *   `10.x` · `16.3.0` · `15.0.0-canary.0`        wildcards and bare versions
 *   `>= 16.0.0 < 16.3.?`                         a `?` for a patch not numbered yet
 *
 * The reading leans toward matching: a false alarm costs a red nightly and a
 * person reading the advisory; a miss costs what the watch exists for. Where
 * the text is ambiguous it is read the wide way — a bare `16.3.0` is the 16.x
 * line from 16.3.0 on, `16.3.?` is any 16.3 patch, an open range stays open —
 * and `patched_versions`, the other field the maintainer fills, closes what
 * the range leaves open (`isPatched`). Pure: no IO; scripts/advisory-watch.ts
 * does the reading.
 */

export interface Version {
  major: number;
  minor: number;
  patch: number;
  /** Dot-separated prerelease identifiers; empty for a release. */
  prerelease: (string | number)[];
}

type Op = ">=" | ">" | "<" | "<=" | "=";

export interface Comparator {
  op: Op;
  version: Version;
}

/** Comparators joined by AND. */
export type Interval = Comparator[];

const VERSION_TOKEN =
  /^v?(\d+|[xX*?])(?:\.(\d+|[xX*?]))?(?:\.(\d+|[xX*?]))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/;
const OPS: Record<string, Op> = {
  ">=": ">=",
  "=>": ">=",
  ">": ">",
  "<=": "<=",
  "=<": "<=",
  "<": "<",
  "=": "=",
};

function isWild(part: string | undefined): boolean {
  return part === undefined || /^[xX*?]$/.test(part);
}

/**
 * One version, exact. `null` when a component is a wildcard, a `?` or
 * missing — those are bounds, not versions (parseBound).
 */
export function parseVersion(text: string): Version | null {
  const m = VERSION_TOKEN.exec(text.trim());
  if (!m || isWild(m[1]) || isWild(m[2]) || isWild(m[3])) return null;
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    prerelease: m[4] ? m[4].split(".").map((id) => (/^\d+$/.test(id) ? Number(id) : id)) : [],
  };
}

/**
 * A version used as a bound. A wildcard, `?` or missing component is read the
 * wide way for the side it bounds: the floor of its line as a lower bound
 * (`>= 14.0` → 14.0.0, `16.3.?` → 16.3.0), the start of the next line as an
 * exclusive upper bound (`< 16.3.?` → < 16.4.0; `<= 10.x` → < 11.0.0, so the
 * returned op may tighten `<=` to `<` and `>` to `>=`).
 */
export function parseBound(op: Op, text: string): Comparator | null {
  const m = VERSION_TOKEN.exec(text.trim());
  if (!m) return null;
  const parts = [m[1], m[2], m[3]];
  const firstWild = parts.findIndex(isWild);
  if (firstWild === -1) {
    const version = parseVersion(text);
    return version && { op, version };
  }
  if (firstWild === 0) return null; // "x" alone or "?" alone says nothing
  const fixed = parts.slice(0, firstWild).map(Number);
  const floor: Version = {
    major: fixed[0],
    minor: fixed[1] ?? 0,
    patch: fixed[2] ?? 0,
    prerelease: [],
  };
  const next: Version = { ...floor };
  if (firstWild === 1) next.major += 1;
  else next.minor += 1;
  switch (op) {
    case "<":
    case "<=":
      return { op: "<", version: next }; // below the line, or the line itself: before the next one
    case ">":
      return { op: ">=", version: next }; // past the line: from the next one
    default:
      return { op, version: floor };
  }
}

function compareIdentifiers(a: string | number, b: string | number): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "number") return -1; // numeric identifiers sort before alphanumeric
  if (typeof b === "number") return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Semantic-versioning precedence: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a: Version, b: Version): number {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (a.prerelease.length === 0 || b.prerelease.length === 0) {
    return b.prerelease.length - a.prerelease.length; // a release outranks its prereleases
  }
  const n = Math.min(a.prerelease.length, b.prerelease.length);
  for (let i = 0; i < n; i++) {
    const c = compareIdentifiers(a.prerelease[i], b.prerelease[i]);
    if (c !== 0) return c;
  }
  return a.prerelease.length - b.prerelease.length;
}

export function satisfiesComparator(version: Version, { op, version: bound }: Comparator): boolean {
  const c = compareVersions(version, bound);
  switch (op) {
    case ">=":
      return c >= 0;
    case ">":
      return c > 0;
    case "<":
      return c < 0;
    case "<=":
      return c <= 0;
    case "=":
      return c === 0;
  }
}

/** Inside any interval (OR of ANDs). */
export function satisfiesRange(version: Version, range: Interval[]): boolean {
  return range.some((interval) =>
    interval.every((comparator) => satisfiesComparator(version, comparator)),
  );
}

function nextMajor(version: Version): Version {
  return { major: version.major + 1, minor: 0, patch: 0, prerelease: [] };
}

type GroupKind = "lower" | "upper" | "complete";

interface Group {
  comparators: Interval;
  kind: GroupKind;
}

function classify(comparators: Interval): GroupKind {
  const lower = comparators.every((c) => c.op === ">=" || c.op === ">");
  const upper = comparators.every((c) => c.op === "<" || c.op === "<=");
  return lower ? "lower" : upper ? "upper" : "complete";
}

/** One comma-free group of tokens. `null` when a token is not a version or an operator. */
function parseGroup(text: string): Group | null {
  const tokens = text
    .replace(/\band\b/gi, " ")
    .split(/\s+/)
    .filter(Boolean);
  const comparators: Interval = [];
  let kind: GroupKind | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // A hyphen range: `a - b`.
    if (tokens[i + 1] === "-" && tokens[i + 2]) {
      const low = parseBound(">=", token);
      const high = parseBound("<=", tokens[i + 2]);
      if (!low || !high) return null;
      comparators.push(low, high);
      kind = "complete";
      i += 2;
      continue;
    }
    // An operator on its own token, or glued to the version.
    const glued = /^(>=|=>|<=|=<|>|<|=)\s*(.*)$/.exec(token);
    let op: Op | null = null;
    let versionText = token;
    if (glued) {
      op = OPS[glued[1]];
      versionText = glued[2];
      if (!versionText) {
        versionText = tokens[++i] ?? "";
      }
    }
    if (op) {
      const bound = parseBound(op, versionText);
      if (!bound) return null;
      comparators.push(bound);
      continue;
    }
    // A bare version: the line it starts, read wide — `10.x` is 10.0.0 up to
    // 11.0.0, `16.3.0` is 16.3.0 up to 17.0.0, `15.0.0-canary.0` likewise.
    const low = parseBound(">=", versionText);
    if (!low) return null;
    const exact = parseVersion(versionText);
    const high: Comparator = exact
      ? { op: "<", version: nextMajor(exact) }
      : (parseBound("<=", versionText) as Comparator);
    comparators.push(low, high);
    kind = "complete";
  }
  if (comparators.length === 0) return null;
  return { comparators, kind: kind ?? classify(comparators) };
}

/**
 * The whole `vulnerable_version_range`, as intervals joined by OR. A comma
 * joins one lower and one upper bound into a single interval (`>= a, < b`);
 * any other comma separates intervals — two complete ranges, or bounds in the
 * same direction, which name one release line each. `null` when any token
 * is not understood; the caller treats that as a match.
 */
export function parseRange(text: string): Interval[] | null {
  const groups: Group[] = [];
  for (const part of text.split(",")) {
    if (!part.trim()) continue;
    const group = parseGroup(part);
    if (!group) return null;
    groups.push(group);
  }
  if (groups.length === 0) return null;
  if (groups.length === 2) {
    const kinds = new Set(groups.map((g) => g.kind));
    if (kinds.has("lower") && kinds.has("upper")) return [groups.flatMap((g) => g.comparators)];
  }
  const intervals: Interval[] = [];
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    const next = groups[i + 1];
    if (group.kind === "lower" && next?.kind === "upper") {
      intervals.push([...group.comparators, ...next.comparators]);
      i += 1;
    } else {
      intervals.push(group.comparators);
    }
  }
  return intervals;
}

/**
 * The `patched_versions` field: versions separated by commas or spaces, a
 * `v` prefix allowed, a `?` read as the next line (`16.3.?` → 16.4.0, so a
 * version on the 16.3 line stays flagged until the patch is numbered).
 */
export function parsePatched(text: string | null | undefined): Version[] {
  if (!text) return [];
  const versions: Version[] = [];
  for (const token of text.split(/[\s,]+/).filter(Boolean)) {
    const bound = parseBound("<", token);
    if (bound) versions.push(bound.version);
  }
  return versions;
}

/**
 * Whether `patched_versions` says the installed version carries the fix.
 * Maintainers list the first fixed version of each release line they
 * backported to, so the line that speaks for a version is its own
 * major.minor when one is listed, else its major, else any: a version at or
 * past that line's fix is patched. With nothing listed, nothing is patched.
 */
export function isPatched(version: Version, patched: Version[]): boolean {
  if (patched.length === 0) return false;
  const sameMinor = patched.filter((p) => p.major === version.major && p.minor === version.minor);
  const sameMajor = patched.filter((p) => p.major === version.major);
  const line = sameMinor.length ? sameMinor : sameMajor.length ? sameMajor : patched;
  return line.some((p) => compareVersions(p, version) <= 0);
}

export interface Coverage {
  /** The range includes the version, or could not be read (`unparsed`). */
  covered: boolean;
  unparsed: boolean;
  patched: boolean;
}

/** Whether one vulnerability entry covers an installed version. */
export function covers(
  version: Version,
  vulnerableRange: string | null | undefined,
  patchedVersions: string | null | undefined,
): Coverage {
  const range = vulnerableRange ? parseRange(vulnerableRange) : null;
  if (!range) return { covered: true, unparsed: true, patched: false };
  if (!satisfiesRange(version, range)) return { covered: false, unparsed: false, patched: false };
  const patched = isPatched(version, parsePatched(patchedVersions));
  return { covered: !patched, unparsed: false, patched };
}

export function formatVersion(version: Version): string {
  const core = `${version.major}.${version.minor}.${version.patch}`;
  return version.prerelease.length ? `${core}-${version.prerelease.join(".")}` : core;
}
