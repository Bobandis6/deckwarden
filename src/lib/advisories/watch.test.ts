/**
 * S0 — the advisory watch's pure half: the five advisories the 2026-10-18
 * audit found (two critical and one high on next 16.3.8; one critical and one
 * high on better-auth 1.7.2) alarm on the old versions and not on 16.4.2 and
 * 1.7.10; the accepted list reports instead of alarming; withdrawn, non-npm
 * and unreadable entries behave as the header of watch.ts says; and the
 * installed tree is read from pnpm's JSON once per distinct version.
 */
import { describe, expect, it } from "vitest";

import {
  collectInstalled,
  formatHit,
  parseInstalledArg,
  watchAdvisories,
  type Advisory,
} from "./watch";

function advisory(
  ghsaId: string,
  severity: string,
  summary: string,
  entries: [name: string, range: string, patched: string][],
  extra: Partial<Advisory> = {},
): Advisory {
  return {
    ghsa_id: ghsaId,
    severity,
    summary,
    html_url: `https://github.com/advisories/${ghsaId}`,
    published_at: "2026-10-14T17:46:48Z",
    withdrawn_at: null,
    vulnerabilities: entries.map(([name, range, patched]) => ({
      package: { ecosystem: "npm", name },
      vulnerable_version_range: range,
      patched_versions: patched,
    })),
    ...extra,
  };
}

/** The feeds' entries for the five advisories of the audit, ranges verbatim. */
const AUDITED: Advisory[] = [
  advisory(
    "GHSA-2464-fhr4-w9xw",
    "critical",
    "RCE in Image Optimization API when SVG files are used",
    [
      ["next", ">= 10.0.0  <= 15.5.27", "15.5.28"],
      ["next", "> 16.0.0 <= 16.4.0", "16.4.1"],
    ],
  ),
  advisory(
    "GHSA-673q-mjm6-r5xr",
    "critical",
    "RCE in `use cache` functions returning typed arrays",
    [["next", ">=16.0.0 <= 16.4.0", "16.4.1"]],
  ),
  advisory("GHSA-p3m5-59mp-jv5r", "high", "Denial of Service in App Router using Server Actions", [
    ["next", ">=13.0.0 <= 15.5.27", "15.5.28"],
    ["next", ">= 16.0.0 <= 16.4.0", "16.4.1"],
  ]),
  advisory("GHSA-965c-763c-88jm", "critical", "OAuth state can be used as a Magic Link", [
    ["better-auth", ">= 1.4.0-beta.18, < 1.7.7", "1.7.7"],
  ]),
  advisory("GHSA-r4xp-prcw-77qf", "high", "OAuth Proxy lets an attacker sign in as another user", [
    ["better-auth", ">= 1.5.0-beta.12, < 1.7.7", "1.7.7"],
  ]),
  advisory(
    "GHSA-44jh-23m7-hpcf",
    "low",
    "Concurrent requests can exceed rate limits on PostgreSQL",
    [
      ["@better-auth/drizzle-adapter", ">= 1.6.17, < 1.7.7", "1.7.7"],
      ["@better-auth/kysely-adapter", ">= 1.6.17, < 1.7.0", "1.7.0"],
      ["better-auth", ">= 1.6.17, < 1.7.7", "1.7.7"],
    ],
  ),
];

describe("watchAdvisories on the audit's five", () => {
  it("alarms on next 16.3.8 three times and on better-auth 1.7.2 three times", () => {
    const result = watchAdvisories(AUDITED, [
      { name: "next", version: "16.3.8" },
      { name: "better-auth", version: "1.7.2" },
      { name: "@better-auth/drizzle-adapter", version: "1.7.2" },
    ]);
    expect(result.alarms.map((h) => `${h.ghsaId} ${h.name}@${h.version}`)).toEqual([
      "GHSA-2464-fhr4-w9xw next@16.3.8",
      "GHSA-673q-mjm6-r5xr next@16.3.8",
      "GHSA-p3m5-59mp-jv5r next@16.3.8",
      "GHSA-965c-763c-88jm better-auth@1.7.2",
      "GHSA-r4xp-prcw-77qf better-auth@1.7.2",
      "GHSA-44jh-23m7-hpcf @better-auth/drizzle-adapter@1.7.2",
      "GHSA-44jh-23m7-hpcf better-auth@1.7.2",
    ]);
    expect(result.accepted).toEqual([]);
    expect(result.watched).toEqual([
      "@better-auth/drizzle-adapter@1.7.2",
      "better-auth@1.7.2",
      "next@16.3.8",
    ]);
  });

  it("is quiet on next 16.4.2 and better-auth 1.7.10, and still says what it watched", () => {
    const result = watchAdvisories(AUDITED, [
      { name: "next", version: "16.4.2" },
      { name: "better-auth", version: "1.7.10" },
      { name: "@better-auth/drizzle-adapter", version: "1.7.10" },
      { name: "react", version: "19.2.8" },
    ]);
    expect(result.alarms).toEqual([]);
    expect(result.watched).toEqual([
      "@better-auth/drizzle-adapter@1.7.10",
      "better-auth@1.7.10",
      "next@16.4.2",
    ]);
  });

  it("the patched floor itself is clean, the version below it is not", () => {
    expect(watchAdvisories(AUDITED, [{ name: "next", version: "16.4.1" }]).alarms).toEqual([]);
    expect(watchAdvisories(AUDITED, [{ name: "next", version: "16.4.0" }]).alarms).toHaveLength(3);
    expect(watchAdvisories(AUDITED, [{ name: "better-auth", version: "1.7.7" }]).alarms).toEqual(
      [],
    );
    expect(
      watchAdvisories(AUDITED, [{ name: "better-auth", version: "1.7.6" }]).alarms,
    ).toHaveLength(3);
  });

  it("the hit carries the fields a reader needs", () => {
    const [hit] = watchAdvisories(AUDITED, [{ name: "next", version: "16.3.8" }]).alarms;
    expect(hit).toEqual({
      ghsaId: "GHSA-2464-fhr4-w9xw",
      severity: "critical",
      summary: "RCE in Image Optimization API when SVG files are used",
      url: "https://github.com/advisories/GHSA-2464-fhr4-w9xw",
      name: "next",
      version: "16.3.8",
      range: "> 16.0.0 <= 16.4.0",
      patched: "16.4.1",
      unparsed: false,
    });
    expect(formatHit(hit)).toBe(
      'GHSA-2464-fhr4-w9xw (critical) covers next@16.3.8: RCE in Image Optimization API when SVG files are used — range "> 16.0.0 <= 16.4.0", patched 16.4.1 — https://github.com/advisories/GHSA-2464-fhr4-w9xw',
    );
  });
});

describe("watchAdvisories — the edges", () => {
  const openEnded = advisory(
    "GHSA-fmh4-wcc4-5jm3",
    "high",
    "Organization invitations can be accepted by an unverified account",
    [
      ["better-auth", "< 1.6.11", "1.6.11"],
      ["better-auth", ">= 1.6.14", ""],
    ],
  );

  it("an accepted advisory is reported with its reason, not alarmed", () => {
    const result = watchAdvisories([openEnded], [{ name: "better-auth", version: "1.7.10" }], {
      "GHSA-fmh4-wcc4-5jm3": "the organization plugin is not installed",
    });
    expect(result.alarms).toEqual([]);
    expect(result.accepted).toMatchObject([
      {
        ghsaId: "GHSA-fmh4-wcc4-5jm3",
        name: "better-auth",
        version: "1.7.10",
        range: ">= 1.6.14",
        patched: "",
        reason: "the organization plugin is not installed",
      },
    ]);
    expect(formatHit(result.accepted[0])).toContain("nothing patched");
  });

  it("the same advisory alarms when it is not accepted", () => {
    const result = watchAdvisories([openEnded], [{ name: "better-auth", version: "1.7.10" }]);
    expect(result.alarms).toHaveLength(1);
  });

  it("a withdrawn advisory, another ecosystem and an uninstalled package are skipped", () => {
    const result = watchAdvisories(
      [
        advisory("GHSA-with-draw-n000", "critical", "withdrawn", [["next", ">= 1.0.0", ""]], {
          withdrawn_at: "2026-01-01T00:00:00Z",
        }),
        advisory(
          "GHSA-pypi-pypi-0000",
          "critical",
          "another ecosystem",
          [["next", ">= 1.0.0", ""]],
          {
            vulnerabilities: [
              {
                package: { ecosystem: "pip", name: "next" },
                vulnerable_version_range: ">= 1.0.0",
                patched_versions: null,
              },
            ],
          },
        ),
        advisory("GHSA-othr-pkgs-0000", "critical", "not installed", [
          ["@next/mdx", ">= 1.0.0", ""],
        ]),
      ],
      [{ name: "next", version: "16.4.2" }],
    );
    expect(result.alarms).toEqual([]);
    expect(result.watched).toEqual([]);
  });

  it("a range it cannot read alarms and says so; a null package is skipped", () => {
    const result = watchAdvisories(
      [
        advisory("GHSA-unre-adab-le00", "medium", "odd range", [["next", "all versions", ""]]),
        {
          ...advisory("GHSA-null-pkgx-0000", "medium", "no package", []),
          vulnerabilities: [
            { package: null, vulnerable_version_range: ">= 1.0.0", patched_versions: null },
          ],
        },
      ],
      [{ name: "next", version: "16.4.2" }],
    );
    expect(result.alarms).toHaveLength(1);
    expect(result.alarms[0].unparsed).toBe(true);
    expect(formatHit(result.alarms[0])).toContain('range "all versions" not understood');
  });

  it("two installed versions of one package are each checked; one advisory reports a pair once", () => {
    const result = watchAdvisories(
      [
        advisory("GHSA-twic-e000-0000", "low", "two entries, one line", [
          ["undici", ">= 7.0.0 < 7.30.0", "7.30.0"],
          ["undici", ">= 7.0.0 < 7.30.0", "7.30.0"],
        ]),
      ],
      [
        { name: "undici", version: "7.29.0" },
        { name: "undici", version: "7.30.1" },
        { name: "undici", version: "8.12.2" },
      ],
    );
    expect(result.alarms.map((h) => h.version)).toEqual(["7.29.0"]);
    expect(result.watched).toEqual(["undici@7.29.0", "undici@7.30.1", "undici@8.12.2"]);
  });

  it("an installed version that is not a version is ignored", () => {
    const result = watchAdvisories(AUDITED, [{ name: "next", version: "link:../next" }]);
    expect(result.alarms).toEqual([]);
    expect(result.watched).toEqual([]);
  });
});

describe("collectInstalled", () => {
  it("walks pnpm list's nested JSON once per distinct name@version and skips links", () => {
    const json = [
      {
        name: "deckwarden",
        dependencies: {
          next: { version: "16.4.2", dependencies: { "@next/env": { version: "16.4.2" } } },
          "better-auth": {
            version: "1.7.10",
            dependencies: {
              "@better-auth/core": { version: "1.7.10" },
              zod: { version: "4.5.4" },
            },
          },
          zod: { version: "4.4.3" },
          local: { version: "link:../local" },
        },
        devDependencies: {
          vitest: { version: "4.1.11", dependencies: { zod: { version: "4.4.3" } } },
        },
        optionalDependencies: { fsevents: { version: "2.3.3" } },
      },
    ];
    expect(collectInstalled(json)).toEqual([
      { name: "@better-auth/core", version: "1.7.10" },
      { name: "@next/env", version: "16.4.2" },
      { name: "better-auth", version: "1.7.10" },
      { name: "fsevents", version: "2.3.3" },
      { name: "next", version: "16.4.2" },
      { name: "vitest", version: "4.1.11" },
      { name: "zod", version: "4.4.3" },
      { name: "zod", version: "4.5.4" },
    ]);
  });

  it("takes a single project object too, and nothing from junk", () => {
    expect(collectInstalled({ dependencies: { next: { version: "16.4.2" } } })).toEqual([
      { name: "next", version: "16.4.2" },
    ]);
    expect(collectInstalled(null)).toEqual([]);
    expect(collectInstalled("nope")).toEqual([]);
  });
});

describe("parseInstalledArg", () => {
  it("splits name@version, scoped names included", () => {
    expect(parseInstalledArg("next@16.3.8")).toEqual({ name: "next", version: "16.3.8" });
    expect(parseInstalledArg("@better-auth/core@1.7.10")).toEqual({
      name: "@better-auth/core",
      version: "1.7.10",
    });
  });

  it("refuses a missing name, a missing version or a non-version", () => {
    for (const arg of ["next", "@16.3.8", "next@", "next@latest", ""]) {
      expect(() => parseInstalledArg(arg), arg).toThrow();
    }
  });
});
