// @vitest-environment node
/**
 * Repository posture (S7, SECURITY-AUDIT-report.md L18): every action a
 * workflow runs is pinned to a full commit SHA — a tag can be re-pointed by
 * whoever controls the action's repository, a commit cannot — with the
 * version in a trailing comment, which Dependabot's `github-actions` entry
 * reads to move the SHA and the comment together. `ci.yml` asks for the
 * least token it needs; the nightly keeps `actions: write` for its keepalive
 * step and the restore drill reads only.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKFLOWS = join(process.cwd(), ".github", "workflows");
const read = (file: string) => readFileSync(join(WORKFLOWS, file), "utf8");
const files = readdirSync(WORKFLOWS)
  .filter((file) => /\.ya?ml$/.test(file))
  .sort();

/** `uses: owner/repo[/path]@<40 hex> # vX.Y.Z` and nothing else. */
const PINNED =
  /^\s*-?\s*uses:\s*[\w.-]+\/[\w.-]+(?:\/[\w./-]+)?@[0-9a-f]{40}\s+#\s*v\d+\.\d+\.\d+\s*$/;

const usesLines = (text: string) => text.split("\n").filter((line) => /^\s*-?\s*uses:/.test(line));

/** The workflow-level `permissions:` block as `key: value` lines, comments dropped. */
function topLevelPermissions(text: string): string[] | null {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^permissions:\s*$/.test(line));
  if (start === -1) return null;
  const block: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (!/^\s+\S/.test(line)) break;
    block.push(line.trim().replace(/\s*#.*$/, ""));
  }
  return block;
}

describe("the workflows (SECURITY-AUDIT-report.md L18)", () => {
  it("are the three files the package covers", () => {
    expect(files).toEqual(["ci.yml", "nightly-ingest.yml", "restore-drill.yml"]);
  });

  it.each(files)("%s pins every action to a commit SHA with its version in a comment", (file) => {
    for (const line of usesLines(read(file))) expect(line).toMatch(PINNED);
  });

  it.each(["ci.yml", "nightly-ingest.yml"])(
    "%s runs the three setup actions, each pinned",
    (file) => {
      const uses = usesLines(read(file));
      expect(uses).toHaveLength(3);
      expect(uses.map((line) => line.replace(/@.*$/, "").trim())).toEqual([
        "- uses: actions/checkout",
        "- uses: pnpm/action-setup",
        "- uses: actions/setup-node",
      ]);
    },
  );

  it("the restore drill runs no action at all", () => {
    expect(usesLines(read("restore-drill.yml"))).toEqual([]);
  });

  it("ci.yml declares a read-only token", () => {
    expect(topLevelPermissions(read("ci.yml"))).toEqual(["contents: read"]);
  });

  it("the nightly keeps actions: write for its keepalive step and nothing more", () => {
    const nightly = read("nightly-ingest.yml");
    expect(topLevelPermissions(nightly)).toEqual(["contents: read", "actions: write"]);
    expect(nightly).toMatch(/actions\/workflows\/nightly-ingest\.yml\/enable/);
  });

  it("the restore drill reads only", () => {
    expect(topLevelPermissions(read("restore-drill.yml"))).toEqual(["contents: read"]);
  });
});

/**
 * The nightly's steps as `{ step, cap }`: a step opens at `      - ` under the
 * job's `steps:`, and its `timeout-minutes` sits two spaces further in.
 */
function nightlySteps(text: string): { step: string; cap: number | null }[] {
  const lines = text.split("\n");
  const steps: { step: string; cap: number | null }[] = [];
  for (const line of lines.slice(lines.findIndex((l) => /^ {4}steps:\s*$/.test(l)) + 1)) {
    if (line.startsWith("      - ")) steps.push({ step: line.trim(), cap: null });
    const cap = /^ {8}timeout-minutes: (\d+)\s*$/.exec(line);
    if (cap) steps[steps.length - 1].cap = Number(cap[1]);
  }
  return steps;
}

describe("the nightly's time budget (the 2026-10-30 audit's bulk-read record)", () => {
  const nightly = read("nightly-ingest.yml");
  const steps = nightlySteps(nightly);
  const jobTimeout = Number(/^ {4}timeout-minutes: (\d+)\s*$/m.exec(nightly)?.[1]);

  it("reads every step of the job", () => {
    expect(steps.length).toBeGreaterThanOrEqual(20);
    expect(steps[0].step).toMatch(/^- uses: actions\/checkout@/);
    expect(steps[steps.length - 1].step).toMatch(/^- name: Workflow keepalive/);
  });

  it("caps every step, so a slow one fails itself instead of reaching the job timeout", () => {
    expect(steps.filter(({ cap }) => cap === null)).toEqual([]);
  });

  it("fits every cap inside the job timeout, with room for the runner's own setup", () => {
    const sum = steps.reduce((total, { cap }) => total + (cap ?? 0), 0);
    expect(sum + 10).toBeLessThanOrEqual(jobTimeout);
  });

  it("keeps the safety steps behind !cancelled(), so a capped step's failure still runs them", () => {
    for (const name of ["Database size gauge", "Back up user tables", "Purge stale anonymous"]) {
      const at = nightly.indexOf(`- name: ${name}`);
      expect(at, name).toBeGreaterThan(-1);
      expect(nightly.slice(at, at + 200), name).toContain("if: ${{ !cancelled() }}");
    }
  });
});

describe("dependabot.yml", () => {
  const text = readFileSync(join(process.cwd(), ".github", "dependabot.yml"), "utf8");

  it("keeps the SHA pins moving: a weekly github-actions entry grouped like the npm one", () => {
    const entries = text.split(/^\s+- package-ecosystem: /m).slice(1);
    expect(entries.map((entry) => entry.split("\n")[0])).toEqual(["npm", "github-actions"]);
    for (const entry of entries) {
      expect(entry).toMatch(/^\s+directory: \/$/m);
      expect(entry).toMatch(/^\s+interval: weekly$/m);
      expect(entry).toMatch(
        /^\s+minor-and-patch:\n\s+patterns:\n\s+- "\*"\n\s+update-types:\n\s+- minor\n\s+- patch$/m,
      );
    }
  });

  it("holds @types/node to the runtime's major: its majors are ignored and package.json names the workflows' Node", () => {
    const [npm, actions] = text.split(/^\s+- package-ecosystem: /m).slice(1);
    expect(npm).toMatch(
      /^\s+ignore:\n\s+- dependency-name: "@types\/node"\n\s+update-types:\n\s+- version-update:semver-major$/m,
    );
    expect(actions).not.toMatch(/ignore:/);

    const majors = ["ci.yml", "nightly-ingest.yml"].map(
      (file) => /^\s+node-version: (\d+)$/m.exec(read(file))?.[1],
    );
    expect(majors).toEqual(["22", "22"]);
    const { devDependencies } = JSON.parse(
      readFileSync(join(process.cwd(), "package.json"), "utf8"),
    ) as { devDependencies: Record<string, string> };
    expect(devDependencies["@types/node"]).toBe(`^${majors[0]}`);
  });
});
