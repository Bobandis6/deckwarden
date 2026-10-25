// @vitest-environment node
/**
 * PUT /api/decks/[id]/cards (S4): the limiter's order around the ownership
 * gate (SECURITY-AUDIT-report.md M1) and the deck row lock on the write
 * (L7), through the REAL drizzle builders, the REAL limiter (its upsert
 * answered by the in-memory counters table, src/test/rate-limit-table.ts)
 * and a fake postgres.js client that models just enough of Postgres to
 * race the route against the real `restoreVersion`: committed deck_cards
 * rows, a per-transaction write set applied at commit (a DELETE sees only
 * committed rows, as under READ COMMITTED), and the deck row lock as a
 * queue that `SELECT … FOR UPDATE` waits on until the holder commits. Every
 * statement yields a macrotask, so two writers interleave statement by
 * statement. Mutation-checked: with `lockDeck` removed from the route the
 * race test commits the merged list the finding describes.
 */
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as schema from "@/db/schema";
import { GAME_ID } from "@/db/seed-data";
import type { DeckRow } from "@/lib/decks/serialize";
import { createRateLimitTable } from "@/test/rate-limit-table";

const DECK = "33333333-3333-4333-8333-333333333333";
const TOKEN = "7a9b2c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER_IP = "198.51.100.7";
const STRANGER_IP = "203.0.113.9";

/** A committed deck_cards row, keyed in the table by zone|cardId. */
interface Row {
  zone: string;
  cardId: string;
  qty: number;
  printingId: string | null;
  tags: unknown;
}
interface Tx {
  name: string;
  deletes: Set<string>;
  inserts: Row[];
}

const counters = createRateLimitTable();
let table = new Map<string, Row>();
/** Every statement and transaction event, in the order it happened. */
let log: string[] = [];
let txSerial = 0;
const lock = { held: false, queue: [] as (() => void)[] };
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

function acquire(): Promise<void> {
  if (!lock.held) {
    lock.held = true;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    lock.queue.push(() => {
      lock.held = true;
      resolve();
    });
  });
}
function release() {
  lock.held = false;
  lock.queue.shift()?.();
}

const COLUMNS = Object.keys(getTableColumns(schema.decks)) as (keyof DeckRow)[];
const deck: Record<string, unknown> = {
  id: DECK,
  publicId: "abcdefgh2345",
  gameId: GAME_ID.mtg,
  formatId: 1,
  userId: null,
  claimToken: TOKEN,
  createdIp: null,
  name: "Guest deck",
  description: null,
  notes: null,
  visibility: "public",
  kind: "user",
  leaderIds: [U(1)],
  ciMask: 0,
  folderId: null,
  forkedFromDeckId: null,
  currentVersion: 3,
  likesCount: 0,
  goals: null,
  hiddenTokens: null,
  preconDeckId: null,
  ownsPrecon: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-10-01T12:00:00.000Z",
};
const deckRow = COLUMNS.map((c) => deck[c]);

/** The fake's one token identity (DECK-TOKENS): a Treasure. */
const TREASURE = U(9);

/** A card row in the route's select order (id … attrs). */
function cardRow(id: string, commander = false): unknown[] {
  if (id === TREASURE) {
    return [
      id,
      "Treasure",
      `key-${id}`,
      "Artifact",
      0,
      0,
      0,
      false,
      false,
      "0.10",
      null,
      {
        type_line: "Token Artifact — Treasure",
        oracle_text: "{T}, Sacrifice this token: Add one mana of any color.",
        is_token: true,
      },
    ];
  }
  return [
    id,
    commander ? "Atraxa, Praetors' Voice" : `Card ${id.slice(-2)}`,
    `key-${id}`,
    commander ? "Creature" : "Artifact",
    commander ? 4 : 1,
    0,
    0,
    commander,
    false,
    "0.25",
    null,
    {
      type_line: commander ? "Legendary Creature — Phyrexian Angel Horror" : "Artifact",
      oracle_text: "",
      mana_cost: "{1}",
      keywords: [],
    },
  ];
}

/** Answers one statement: its rows, and its effect on the model. */
function answer(sql: string, params: unknown[], tx: Tx | null, who: string): unknown[][] {
  if (counters.handles(sql)) {
    log.push(`${who}:counter ${String(params[0]).split(":")[1]}`);
    return counters.answer(params);
  }
  if (sql.includes('from "decks" where "decks"."id" = $1 limit $2')) {
    log.push(`${who}:deck`);
    return [deckRow];
  }
  if (sql.includes('from "legalities"')) {
    log.push(`${who}:legality`);
    return [];
  }
  if (
    sql.startsWith(
      'select "id", "ci_mask", "card_identities"."attrs" @> $1::jsonb from "card_identities"',
    )
  ) {
    // restoreVersion's read (DECK-TOKENS adds isToken, its document bound first).
    log.push(`${who}:identities`);
    return (params.slice(1, -1) as string[]).map((id) => [id, 0, id === TREASURE]);
  }
  if (sql.includes('from "card_identities"')) {
    log.push(`${who}:cards`);
    return (params.slice(0, -1) as string[]).map((id) => cardRow(id, id === U(1)));
  }
  if (sql.includes('from "card_printings"')) {
    log.push(`${who}:printings`);
    return [];
  }
  if (
    sql.includes(
      'from "deck_versions" where ("deck_versions"."deck_id" = $1 and "deck_versions"."version" = $2)',
    )
  ) {
    log.push(`${who}:version`);
    return [
      [
        params[1],
        "v2",
        "saved",
        "2026-10-01T00:00:00.000Z",
        [
          { cardId: U(1), zone: "commander", qty: 1, tags: [], printingId: null },
          // Version 9 (DECK-TOKENS): a Treasure frozen in main, which no save could write now.
          {
            cardId: params[1] === 9 ? TREASURE : U(3),
            zone: "main",
            qty: 1,
            tags: [],
            printingId: null,
          },
        ],
      ],
    ];
  }
  if (sql.startsWith('select count(*)::int from "deck_versions"')) {
    log.push(`${who}:count`);
    return [[0]];
  }
  if (sql.startsWith('update "decks" set "current_version"')) {
    log.push(`${who}:bump`);
    return [[4]];
  }
  if (sql.startsWith('insert into "deck_versions"')) {
    log.push(`${who}:insert-version`);
    return [];
  }
  if (sql.includes('from "deck_cards" where "deck_cards"."deck_id" = $1 order by')) {
    log.push(`${who}:live`);
    return [...table.values()].map((r) => [r.cardId, r.zone, r.qty, [], r.printingId]);
  }
  if (sql.startsWith('delete from "deck_cards"')) {
    log.push(`${who}:delete`);
    // READ COMMITTED: the delete sees the committed rows of this moment.
    for (const key of table.keys()) tx!.deletes.add(key);
    return [];
  }
  if (sql.startsWith('insert into "deck_cards"')) {
    log.push(`${who}:insert`);
    for (let i = 0; i < params.length; i += 6) {
      const [, zone, cardId, qty, printingId, tags] = params.slice(i, i + 6) as [
        string,
        string,
        string,
        number,
        string | null,
        unknown,
      ];
      tx!.inserts.push({ zone, cardId, qty, printingId, tags });
    }
    return [];
  }
  if (sql.startsWith('update "decks" set "leader_ids"')) {
    log.push(`${who}:denorm`);
    return [];
  }
  throw new Error(`unexpected statement: ${sql}`);
}

function makeClient(tx: Tx | null) {
  const who = tx?.name ?? "route";
  return {
    options: { parsers: {}, serializers: {} },
    unsafe(sql: string, params: unknown[]) {
      if (sql.endsWith("for update")) {
        log.push(`${who}:lock-wait`);
        const held = acquire().then(() => {
          log.push(`${who}:lock-held`);
          return [[params[0]]];
        });
        return {
          values: async () => {
            const rows = await held;
            await tick();
            return rows;
          },
          then: undefined,
        };
      }
      const rows = answer(sql, params, tx, who);
      return {
        values: async () => {
          await tick();
          return rows;
        },
        then: undefined,
      };
    },
    begin: async (fn: (client: unknown) => Promise<unknown>) => {
      const t: Tx = { name: `tx${++txSerial}`, deletes: new Set(), inserts: [] };
      log.push(`${t.name}:begin`);
      const result = await fn(makeClient(t));
      for (const key of t.deletes) table.delete(key);
      for (const row of t.inserts) table.set(`${row.zone}|${row.cardId}`, row);
      log.push(`${t.name}:commit`);
      release();
      return result;
    },
  };
}
const fakeDb = drizzle(makeClient(null) as never, { schema });
vi.mock("@/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db")>()),
  getDb: () => fakeDb,
}));
vi.mock("@/lib/auth", () => ({ getSessionUserId: async () => null }));

const { PUT } = await import("./route");
const { deckFormat } = await import("@/lib/decks/route-helpers");
const { restoreVersion } = await import("@/lib/decks/versions");

const PUT_LIST = [
  { cardId: U(1), zone: "commander", qty: 1 },
  { cardId: U(2), zone: "main", qty: 2 },
  { cardId: U(4), zone: "main", qty: 1 },
];
function put(opts: { id?: string; ip: string; token?: string; body?: unknown }): Promise<Response> {
  const id = opts.id ?? DECK;
  return PUT(
    new NextRequest(`http://localhost:3000/api/decks/${id}/cards`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": opts.ip,
        ...(opts.token ? { "x-deck-token": opts.token } : {}),
      },
      body: JSON.stringify(opts.body ?? { cards: PUT_LIST }),
    }),
    { params: Promise.resolve({ id }) },
  );
}
const committed = () => [...table.keys()].sort();

beforeEach(() => {
  counters.reset();
  table = new Map([
    ["commander|" + U(1), { zone: "commander", cardId: U(1), qty: 1, printingId: null, tags: [] }],
    ["main|" + U(2), { zone: "main", cardId: U(2), qty: 1, printingId: null, tags: [] }],
  ]);
  log = [];
  txSerial = 0;
  lock.held = false;
  lock.queue = [];
});

describe("the limiter around the gate (M1)", () => {
  it("121 tokenless PUTs from a stranger spend the stranger's IP bucket only — no per-deck row exists", async () => {
    for (let i = 0; i < 121; i++) {
      const res = await put({ ip: STRANGER_IP });
      expect(res.status).toBe(403);
    }
    expect(counters.count(`deck-cards:ip:${STRANGER_IP}`)).toBe(121);
    expect(counters.keys()).toEqual([`deck-cards:ip:${STRANGER_IP}`]);
    // Each refusal: the IP counter, the deck row, the 403 — nothing more.
    expect(log.slice(0, 2)).toEqual(["route:counter ip", "route:deck"]);
    expect(log).toHaveLength(242);
  });

  it("…and the owner's next save still lands: 200, the per-deck bucket at 1, the list committed", async () => {
    for (let i = 0; i < 121; i++) await put({ ip: STRANGER_IP });
    log = [];
    const res = await put({ ip: OWNER_IP, token: TOKEN });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ count: 3, leaderIds: [U(1)], ciMask: 0 });
    expect(counters.count(`deck-cards:deck:${DECK}`)).toBe(1);
    expect(counters.count(`deck-cards:ip:${OWNER_IP}`)).toBe(1);
    expect(committed()).toEqual(["commander|" + U(1), "main|" + U(2), "main|" + U(4)]);
    // The order: IP bucket, the proof, the per-deck bucket, then the work.
    expect(log).toEqual([
      "route:counter ip",
      "route:deck",
      "route:counter deck",
      "route:cards",
      "route:legality",
      "tx1:begin",
      "tx1:lock-wait",
      "tx1:lock-held",
      "tx1:delete",
      "tx1:insert",
      "tx1:denorm",
      "tx1:commit",
    ]);
  });

  it("a stranger is bounded by their own address: at the IP cap the deck row is never read", async () => {
    counters.seed(`deck-cards:ip:${STRANGER_IP}`, 360, 60);
    const res = await put({ ip: STRANGER_IP });
    expect(res.status).toBe(429);
    expect(log).toEqual(["route:counter ip"]);
    expect(await put({ ip: OWNER_IP, token: TOKEN }).then((r) => r.status)).toBe(200);
  });

  it("the owner's own per-deck cap still holds — the autosave headroom, spent by the owner alone", async () => {
    counters.seed(`deck-cards:deck:${DECK}`, 120, 60);
    const res = await put({ ip: OWNER_IP, token: TOKEN });
    expect(res.status).toBe(429);
    expect(log).toEqual(["route:counter ip", "route:deck", "route:counter deck"]);
  });

  it("an id that cannot be a deck is a 404 before any counter or query", async () => {
    for (const id of [
      "not-a-uuid",
      "33333333-3333-4333-8333-33333333333",
      "'; drop table decks; --",
    ]) {
      const res = await put({ id, ip: STRANGER_IP });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: "Deck not found" });
    }
    expect(counters.keys()).toEqual([]);
    expect(log).toEqual([]);
  });
});

describe("the token rule (DECK-TOKENS)", () => {
  it("a Treasure in the tokens zone saves beside the 100", async () => {
    const res = await put({
      ip: OWNER_IP,
      token: TOKEN,
      body: { cards: [...PUT_LIST, { cardId: TREASURE, zone: "tokens", qty: 5 }] },
    });
    expect(res.status).toBe(200);
    expect(committed()).toContain("tokens|" + TREASURE);
  });

  it("a Treasure in main is a 400 naming it, and nothing is written", async () => {
    const res = await put({
      ip: OWNER_IP,
      token: TOKEN,
      body: { cards: [...PUT_LIST, { cardId: TREASURE, zone: "main", qty: 1 }] },
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Tokens and cards in the wrong zone",
      issues: [`Card ${TREASURE} is a token, which zone "main" can't hold`],
    });
    expect(log.some((l) => l.endsWith(":begin"))).toBe(false);
    expect(committed()).toEqual(["commander|" + U(1), "main|" + U(2)]);
  });

  it("a restore refuses a version holding a token in the 100, before any write", async () => {
    const format = deckFormat({ gameId: GAME_ID.mtg, formatId: 1 })!.format;
    const restored = await restoreVersion({ id: DECK, gameId: GAME_ID.mtg }, 9, format);
    expect(restored).toEqual({
      ok: false,
      error: "invalid",
      issues: [`Card ${TREASURE} is a token, which zone "main" can't hold`],
    });
    expect(log.some((l) => l.endsWith(":delete"))).toBe(false);
  });

  it("a card in the tokens zone is a 400 too", async () => {
    const res = await put({
      ip: OWNER_IP,
      token: TOKEN,
      body: { cards: [...PUT_LIST, { cardId: U(5), zone: "tokens", qty: 1 }] },
    });
    expect(res.status).toBe(400);
    expect((await res.json()).issues).toEqual([
      `Card ${U(5)} is not a token; zone "tokens" holds tokens only`,
    ]);
  });
});

describe("the deck row lock (L7)", () => {
  it("the write's first statement inside its transaction is the row lock", async () => {
    await put({ ip: OWNER_IP, token: TOKEN });
    const begin = log.indexOf("tx1:begin");
    expect(log.slice(begin, begin + 4)).toEqual([
      "tx1:begin",
      "tx1:lock-wait",
      "tx1:lock-held",
      "tx1:delete",
    ]);
  });

  it("a restore racing an autosave: the later writer waits for the earlier commit and the list is one writer's, never merged", async () => {
    const format = deckFormat({ gameId: GAME_ID.mtg, formatId: 1 })!.format;
    const restore = restoreVersion({ id: DECK, gameId: GAME_ID.mtg }, 2, format);
    const save = put({ ip: OWNER_IP, token: TOKEN });
    const [restored, res] = await Promise.all([restore, save]);
    expect(restored).toMatchObject({ ok: true, restoredVersion: 2, count: 2 });
    expect(res.status).toBe(200);

    // tx1 (the restore) held the lock first; tx2 (the autosave) waited for
    // its commit, deleted the restored list and committed its own, whole.
    expect(log.indexOf("tx2:lock-wait")).toBeLessThan(log.indexOf("tx1:commit"));
    expect(log.indexOf("tx2:lock-held")).toBeGreaterThan(log.indexOf("tx1:commit"));
    expect(log.indexOf("tx2:delete")).toBeGreaterThan(log.indexOf("tx1:commit"));
    expect(committed()).toEqual(["commander|" + U(1), "main|" + U(2), "main|" + U(4)]);
    expect(committed()).not.toContain("main|" + U(3));
  });
});
