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
});
