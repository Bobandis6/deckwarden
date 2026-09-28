/**
 * The ranked name matcher (X2, WAVE3.md D2). Two halves: the contract's
 * SEMANTICS, read through the LIKE patterns with a small LIKE evaluator (the
 * one definition the SQL is rendered from), and the rendered SQL pinned the
 * way translate.test.ts pins the translator's. Names are written as
 * `name_norm` stores them (lowercased, deaccented, punctuation kept).
 */
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { searchIdPrefix } from "@/lib/cards/resolve-token";
import { mtgAdapter } from "@/lib/games/mtg/adapter";
import { optcgAdapter } from "@/lib/games/optcg/adapter";
import { NAME_MIN_CHARS, NAME_QUERY_MAX, nameKey } from "@/lib/search/name-key";

import {
  escapeLike,
  matchPatterns,
  nameFieldKey,
  nameMatchCondition,
  nameMatchOrder,
  nameMatchRank,
  NEAR_MISS_MIN_CHARS,
  parseNameQuery,
  WORD_BREAKS,
} from "./name-match";

const dialect = new PgDialect();
const render = (fragment: SQL) => dialect.sqlToQuery(fragment);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Postgres LIKE with its default escape (backslash), as a JS predicate. */
function like(value: string, pattern: string): boolean {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "\\") re += escapeRe(pattern[++i] ?? "");
    else if (ch === "%") re += "[\\s\\S]*";
    else if (ch === "_") re += "[\\s\\S]";
    else re += escapeRe(ch);
  }
  return new RegExp(`^${re}$`, "u").test(value);
}

/** The CASE of nameMatchRank, over the same patterns; 5 = "only a near miss can reach it". */
function classOf(nameNorm: string, typed: string): number {
  const q = parseNameQuery(typed);
  if (!q) throw new Error(`nothing survives: ${typed}`);
  const p = matchPatterns(q);
  if (nameNorm === p.exact) return 1;
  if (like(nameNorm, p.prefix)) return 2;
  if (p.wordStarts.every((arms) => arms.some((a) => like(nameNorm, a)))) return 3;
  if (p.contains.every((c) => like(nameNorm, c))) return 4;
  return 5;
}

describe("the LIKE evaluator these tests read the contract through", () => {
  it("honors %, _ and the backslash escape", () => {
    expect(like("sol ring", "sol%")).toBe(true);
    expect(like("sol ring", "%ring")).toBe(true);
    expect(like("sol ring", "s_l ring")).toBe(true);
    expect(like("sol ring", "s\\_l ring")).toBe(false);
    expect(like("s_l", "s\\_l")).toBe(true);
    expect(like("sol ring", "ring%")).toBe(false);
  });
});

describe("parseNameQuery — the typed text as a query", () => {
  it("normalizes through THE shared normalizer, so case, accents and spacing are one query", () => {
    expect(parseNameQuery("  Lörièn   Revealed ")).toEqual({
      text: "lorien revealed",
      words: ["lorien", "revealed"],
    });
    expect(parseNameQuery("Sol")).toEqual(parseNameQuery("sol "));
    expect(parseNameQuery("Fire // Ice")?.text).toBe("fire ice");
  });

  it("keeps commas, apostrophes and hyphens inside words (the normalizer keeps them in names)", () => {
    expect(parseNameQuery("Urza's")?.words).toEqual(["urza's"]);
    expect(parseNameQuery("Kiki-Jiki")?.words).toEqual(["kiki-jiki"]);
    expect(parseNameQuery("atraxa, praetors")?.words).toEqual(["atraxa,", "praetors"]);
  });

  it("drops words with no letter or digit, unless nothing else is left", () => {
    expect(parseNameQuery("kiki - jiki")?.words).toEqual(["kiki", "jiki"]);
    expect(parseNameQuery("_____")?.words).toEqual(["_____"]);
    expect(parseNameQuery("% _")?.words).toEqual(["%", "_"]);
  });

  it("is null when nothing survives, and caps the text at NAME_QUERY_MAX", () => {
    expect(parseNameQuery("")).toBeNull();
    expect(parseNameQuery("   ")).toBeNull();
    expect(parseNameQuery(undefined)).toBeNull();
    const long = parseNameQuery("a".repeat(NAME_QUERY_MAX + 50))!;
    expect(long.text).toHaveLength(NAME_QUERY_MAX);
  });

  it("nameKey is the client's request key: one key per normalized text; one letter is below the floor", () => {
    expect(new Set(["Sol", "sol", "sol ", " SOL"].map(nameKey))).toEqual(new Set(["sol"]));
    expect(nameKey("a").length).toBeLessThan(NAME_MIN_CHARS);
    expect(nameKey("at").length).toBe(NAME_MIN_CHARS);
  });

  it("the normalized key still takes the One Piece card-number pass; Magic never does", () => {
    // The island lowercases before sending — searchIdPrefix upper-cases, and
    // the normalizer keeps the hyphen, so a typed card number stays an id.
    expect(searchIdPrefix("optcg", nameKey("OP01-02"))).toBe("OP01-02");
    expect(searchIdPrefix("optcg", nameKey(" op01-025 "))).toBe("OP01-025");
    expect(searchIdPrefix("optcg", nameKey("st10-"))).toBe("ST10-");
    expect(searchIdPrefix("optcg", nameKey("zoro"))).toBeNull();
    expect(searchIdPrefix("mtg", nameKey("OP01-02"))).toBeNull();
  });
});

describe("escapeLike", () => {
  it("escapes the two wildcards and the escape character itself", () => {
    expect(escapeLike("50%_off\\")).toBe("50\\%\\_off\\\\");
    expect(escapeLike("urza's saga")).toBe("urza's saga");
  });
});

describe("the classes (D2's ranking contract)", () => {
  it("1: the name is exactly what was typed — an obscure exact name outranks every popular one", () => {
    expect(classOf("opt", "Opt")).toBe(1);
    expect(classOf("optimus prime, hero", "opt")).toBe(2);
  });

  it("2: the name starts with what was typed", () => {
    expect(classOf("atraxa, praetors' voice", "atr")).toBe(2);
    expect(classOf("rings of brighthearth", "ring")).toBe(2);
    expect(classOf("atraxa, praetors' voice", "Atraxa, Praetors")).toBe(2);
  });

  it("3: every word starts a word — so `ring` reaches Sol Ring only after the names that start with it", () => {
    expect(classOf("ixhel, scion of atraxa", "atr")).toBe(3);
    expect(classOf("sol ring", "ring")).toBe(3);
    expect(classOf("atraxa, praetors' voice", "atraxa praetors")).toBe(3);
    expect(classOf("atraxa, praetors' voice", "praetors atraxa")).toBe(3);
  });

  it("3: a word starts after a hyphen — `jiki` finds Kiki-Jiki", () => {
    expect(classOf("kiki-jiki, mirror breaker", "jiki")).toBe(3);
    expect(classOf("kiki-jiki, mirror breaker", "kiki jiki")).toBe(3);
    expect(classOf("kiki-jiki, mirror breaker", "jiki mirror")).toBe(3);
  });

  it("3: …and after a period, a double quote or an opening parenthesis (One Piece's names)", () => {
    expect(WORD_BREAKS).toEqual([" ", "-", ".", '"', "("]);
    expect(classOf("monkey.d.luffy", "luffy")).toBe(3);
    expect(classOf("edward.newgate", "newgate")).toBe(3);
    expect(classOf('eustass"captain"kid', "kid")).toBe(3);
    expect(classOf("miss doublefinger(zala)", "zala")).toBe(3);
  });

  it("an apostrophe is not a word break: the `s` of Urza's starts no word", () => {
    expect(classOf("urza's tower", "s tower")).toBe(4);
    expect(classOf("urza's tower", "tower")).toBe(3);
  });

  it("4: every word appears somewhere, inside a word included — what the dropdown refuses", () => {
    expect(classOf("rakdos, patron of chaos", "atr")).toBe(4);
    expect(classOf("hobgoblin", "goblin")).toBe(4);
    expect(classOf("kiki-jiki, mirror breaker", "iki")).toBe(4);
  });

  it("5: anything else is left to trigram similarity — `urzas saga` is not a LIKE match of Urza's Saga", () => {
    expect(classOf("urza's saga", "urzas saga")).toBe(5);
    expect(classOf("sol ring", "atr")).toBe(5);
  });

  it("typed wildcards match themselves: `_` finds the card named _____, `%` and `\\` find nothing", () => {
    expect(classOf("_____", "_____")).toBe(1);
    expect(classOf("_____ goblin", "_")).toBe(2);
    expect(classOf("sol ring", "_")).toBe(5);
    expect(classOf("sol ring", "%")).toBe(5);
    expect(classOf("sol ring", "\\")).toBe(5);
    expect(classOf("sol ring", "s_l")).toBe(5);
  });
});

describe("the rendered SQL", () => {
  it("the dropdown's WHERE is classes 1–3: one OR-group per word, AND across words", () => {
    const q = render(nameMatchCondition(parseNameQuery("kiki jiki")!, "suggest"));
    const arm = (n: number) =>
      `("card_identities"."name_norm" LIKE $${n} OR "card_identities"."name_norm" LIKE $${n + 1} OR "card_identities"."name_norm" LIKE $${n + 2} OR "card_identities"."name_norm" LIKE $${n + 3} OR "card_identities"."name_norm" LIKE $${n + 4} OR "card_identities"."name_norm" LIKE $${n + 5})`;
    expect(q.sql).toBe(`(${arm(1)} AND ${arm(7)})`);
    expect(q.params).toEqual([
      "kiki%",
      "% kiki%",
      "%-kiki%",
      "%.kiki%",
      '%"kiki%',
      "%(kiki%",
      "jiki%",
      "% jiki%",
      "%-jiki%",
      "%.jiki%",
      '%"jiki%',
      "%(jiki%",
    ]);
  });

  it("a list's WHERE is classes 1–4, and adds the near-miss arm from four characters on", () => {
    const short = render(nameMatchCondition(parseNameQuery("atr")!, "list"));
    expect(short.sql).toBe('"card_identities"."name_norm" LIKE $1');
    expect(short.params).toEqual(["%atr%"]);

    const two = render(nameMatchCondition(parseNameQuery("Atraxa Praetors")!, "list"));
    expect(two.sql).toBe(
      '(("card_identities"."name_norm" LIKE $1 AND "card_identities"."name_norm" LIKE $2) OR "card_identities"."name_norm" % $3)',
    );
    expect(two.params).toEqual(["%atraxa%", "%praetors%", "atraxa praetors"]);
    expect("atraxa praetors".length).toBeGreaterThanOrEqual(NEAR_MISS_MIN_CHARS);
  });

  it("wildcards reach the database escaped", () => {
    const q = render(nameMatchCondition(parseNameQuery("_")!, "list"));
    expect(q.params).toEqual(["%\\_%"]);
  });

  it("the rank is one CASE: 1–4 by LIKE, near misses as 6 − similarity", () => {
    const q = render(nameMatchRank(parseNameQuery("sol")!));
    expect(q.sql).toMatch(
      /^CASE WHEN "card_identities"\."name_norm" = \$1 THEN 1 WHEN "card_identities"\."name_norm" LIKE \$2 THEN 2 WHEN .+ THEN 3 WHEN "card_identities"\."name_norm" LIKE \$\d+ THEN 4 ELSE 6 - similarity\("card_identities"\."name_norm", \$\d+\) END$/,
    );
    expect(q.params[0]).toBe("sol");
    expect(q.params[1]).toBe("sol%");
    expect(q.params.at(-1)).toBe("sol");
  });

  it("the order: rank, then play (unranked last), leaders, name, card number", () => {
    const parts = nameMatchOrder(parseNameQuery("sol")!).map((s) => render(s).sql);
    expect(parts).toHaveLength(5);
    expect(parts[0]).toMatch(/^CASE .* END ASC$/);
    expect(parts.slice(1)).toEqual([
      '"card_identities"."popularity" ASC NULLS LAST',
      '"card_identities"."is_leader_candidate" DESC',
      '"card_identities"."name_norm" ASC',
      '"card_identities"."external_key" ASC',
    ]);
  });
});

describe("nameFieldKey", () => {
  it("finds each adapter's trigram name field by declaration", () => {
    expect(nameFieldKey(mtgAdapter.searchFields)).toBe("name");
    expect(nameFieldKey(optcgAdapter.searchFields)).toBe("name");
    expect(nameFieldKey([])).toBeNull();
  });
});
