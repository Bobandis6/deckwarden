// @vitest-environment node
/**
 * robots.txt (P2.6; the AI training crawlers, 2026-10-18) — run over the REAL
 * drizzle builders and a fake postgres.js client that answers the card count,
 * then through Next's own serializer, so the pins read the text a crawler
 * reads. A crawler follows the group that names its token (case-insensitive)
 * and only falls back to `*` when none does (RFC 9309), and `groupFor` picks
 * the group the same way.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { resolveRobots } from "next/dist/build/webpack/loaders/metadata/resolve-route-data";
import { describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";

// 38,192 MTG + OP identities on production (2026-10-18): four card chunks.
const statements: { sql: string; params: unknown[] }[] = [];
const fakeClient = {
  options: { parsers: {}, serializers: {} },
  unsafe(sql: string, params: unknown[]) {
    statements.push({ sql, params });
    return { values: async () => [["38192"]], then: undefined };
  },
};
const fakeDb = drizzle(fakeClient as never, { schema });

vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));

const robotsModule = await import("./robots");
const text = resolveRobots(await robotsModule.default());

function groupFor(token: string) {
  const groups = text
    .split(/\n\n+/)
    .map((block) => block.split("\n").filter(Boolean))
    .map((lines) => ({
      agents: lines
        .filter((line) => /^user-agent:/i.test(line))
        .map((line) =>
          line
            .slice(line.indexOf(":") + 1)
            .trim()
            .toLowerCase(),
        ),
      rules: lines.filter((line) => /^(allow|disallow):/i.test(line)),
    }))
    .filter((group) => group.agents.length > 0);
  return (
    groups.find((group) => group.agents.includes(token.toLowerCase())) ??
    groups.find((group) => group.agents.includes("*"))
  );
}

const STAR_RULES = ["Allow: /", "Disallow: /api/", "Disallow: /decks/", "Disallow: /account"];

describe("robots.txt", () => {
  it("counts the sitemap's cards, never tokens (DECK-TOKENS: a token page is noindex)", () => {
    expect(statements).toHaveLength(1);
    expect(statements[0].sql).toContain('NOT ("card_identities"."attrs" @> $');
    expect(statements[0].params).toContain('{"is_token":true}');
  });

  it("shuts the three AI training crawlers out of the whole site", () => {
    for (const token of ["Reflectionbot", "ClaudeBot", "GPTBot"]) {
      expect(groupFor(token)?.agents, token).not.toContain("*");
      expect(groupFor(token)?.rules, token).toEqual(["Disallow: /"]);
    }
  });

  it("keeps search crawlers and the vendors' other agents on the * rules", () => {
    for (const token of [
      "Googlebot",
      "Bingbot",
      "OAI-SearchBot",
      "ChatGPT-User",
      "Claude-SearchBot",
      "Claude-User",
    ]) {
      expect(groupFor(token)?.agents, token).toContain("*");
      expect(groupFor(token)?.rules, token).toEqual(STAR_RULES);
    }
  });

  it("lists every sitemap, one card chunk per 10,000 identities", () => {
    const sitemaps = text
      .split("\n")
      .filter((line) => line.startsWith("Sitemap: "))
      .map((line) => new URL(line.slice("Sitemap: ".length)).pathname);
    expect(sitemaps).toEqual([
      "/sitemap.xml",
      "/c/sitemap.xml",
      "/l/sitemap.xml",
      "/cards/sitemap/0.xml",
      "/cards/sitemap/1.xml",
      "/cards/sitemap/2.xml",
      "/cards/sitemap/3.xml",
    ]);
  });

  it("stays ISR, revalidated daily", () => {
    expect(robotsModule.revalidate).toBe(86400);
  });
});
