/**
 * MTGJSON Commander precon importer (W8a, WAVE2 §W8a).
 *
 * Turns published product lists into ownerless kind='precon' deck rows +
 * precon_products meta. Never community activity: visibility is public (the
 * point is being found), but created_at = updated_at = RELEASE DATE so a
 * precon can't look "recent", and every community surface filters kind.
 *
 * Schedule: runs nightly (the DeckList index is one polite request) but only
 * NEW codes are fetched on a normal night — a deck skipped for unresolved
 * cards retries the next night, right after Scryfall has ingested the set.
 * The FULL sweep (re-fetch all 191 files, source_hash short-circuits the
 * writes) runs on Sunday UTC or with PRECONS_FULL=true — the "weekly or
 * dispatch" gate lives HERE, not in workflow YAML, so it is testable and
 * env-overridable. MTGJSON's .sha256 sidecars can't drive skipping: they
 * cover raw bytes, and meta.date changes every daily build.
 *
 *   pnpm ingest:precons                    # nightly shape: new codes only
 *   PRECONS_FULL=true pnpm ingest:precons  # full re-fetch + hash compare
 *
 * Collector's Editions (16 today, all with a regular sibling in the same
 * set) are the identical list in premium foils — skipped, counted.
 *
 * Uses the DIRECT (non -pooler) connection like every ingest: the advisory
 * lock is session state.
 */
import { config as loadEnv } from "dotenv";

loadEnv({ path: [".env.local", ".env"], quiet: true });

import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { createDb, schema } from "../../src/db";
import { FORMAT_ID, GAME_ID } from "../../src/db/seed-data";
import { cardListIssues, type DeckCardInput } from "../../src/lib/decks/cards";
import { writeDeckCards } from "../../src/lib/decks/save-cards";
import { COMMANDER } from "../../src/lib/games/mtg/formats";
import {
  COMMANDER_DECK_TYPE,
  collectorsEditionBaseName,
  isCollectorsEdition,
  mapPrecon,
  preconDescription,
  preconHashPayload,
  preconSlug,
  type PreconSkip,
} from "../../src/lib/games/mtg/mtgjson-map";

const USER_AGENT = "Deckwarden/1.0 (https://deckwarden.gg)";
const HEADERS = { "User-Agent": USER_AGENT, Accept: "application/json" };
const DECKLIST_URL = "https://mtgjson.com/api/v5/DeckList.json";
const deckUrl = (fileName: string) => `https://mtgjson.com/api/v5/decks/${fileName}.json`;
const FETCH_GAP_MS = 250;
/** Session-wide lock id shared by all Deckwarden ingest jobs (see scryfall.ts). */
const INGEST_LOCK_KEY = 7234015309;

const { decks, preconProducts } = schema;

function directUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
  return url.replace("-pooler.", ".");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface DeckListEntry {
  code: string;
  fileName: string;
  name: string;
  releaseDate: string;
  type: string;
}

interface Stats {
  commander_entries: number;
  ce_skipped: number;
  considered: number;
  fetched: number;
  ingested_new: number;
  updated: number;
  unchanged: number;
  skipped: Partial<
    Record<PreconSkip | "unresolved_identity" | "structural" | "fetch_failed", number>
  >;
  unresolved_identity_names: string[];
  printings_unresolved: number;
  mapper_warnings: number;
  slug_collisions: number;
  full_mode: boolean;
  duration_ms: number;
  db_size_bytes: number;
}

async function fetchJson(url: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: HEADERS });
    if (res.ok) return res.json();
    if (attempt >= 1) throw new Error(`GET ${url} → ${res.status}`);
    await sleep(1000);
  }
}

async function main() {
  const started = Date.now();
  const { client, db } = createDb(directUrl());
  let runId: number | undefined;

  const fullMode =
    process.env.PRECONS_FULL === "true" ||
    (process.env.PRECONS_FULL !== "false" && new Date().getUTCDay() === 0);

  try {
    const [{ locked }] = await client<
      { locked: boolean }[]
    >`SELECT pg_try_advisory_lock(${INGEST_LOCK_KEY}) AS locked`;
    if (!locked) {
      console.error("another ingest holds the advisory lock; exiting");
      process.exit(2);
    }

    const [run] = await client<{ id: number }[]>`
      INSERT INTO ingest_runs (source, status) VALUES ('precons', 'running') RETURNING id`;
    runId = run.id;

    const stats: Stats = {
      commander_entries: 0,
      ce_skipped: 0,
      considered: 0,
      fetched: 0,
      ingested_new: 0,
      updated: 0,
      unchanged: 0,
      skipped: {},
      unresolved_identity_names: [],
      printings_unresolved: 0,
      mapper_warnings: 0,
      slug_collisions: 0,
      full_mode: fullMode,
      duration_ms: 0,
      db_size_bytes: 0,
    };
    const skip = (reason: keyof Stats["skipped"]) => {
      stats.skipped[reason] = (stats.skipped[reason] ?? 0) + 1;
    };

    const index = (await fetchJson(DECKLIST_URL)) as { data?: DeckListEntry[] };
    const all = (index.data ?? []).filter((e) => e.type === COMMANDER_DECK_TYPE);
    stats.commander_entries = all.length;

    // Collector's Editions: identical lists in premium foils. Skip when the
    // regular sibling exists in the same set; a CE WITHOUT one would be the
    // only source for that list and is kept.
    const regularKeys = new Set(
      all.filter((e) => !isCollectorsEdition(e.name)).map((e) => `${e.code}|${e.name}`),
    );
    const keepers = all.filter((e) => {
      if (!isCollectorsEdition(e.name)) return true;
      const sibling = regularKeys.has(`${e.code}|${collectorsEditionBaseName(e.name)}`);
      if (sibling) stats.ce_skipped++;
      return !sibling;
    });

    const existingRows = await db
      .select({
        code: preconProducts.code,
        deckId: preconProducts.deckId,
        slug: preconProducts.slug,
        sourceHash: preconProducts.sourceHash,
      })
      .from(preconProducts);
    const existing = new Map(existingRows.map((r) => [r.code, r]));
    const usedSlugs = new Set(existingRows.map((r) => r.slug));

    const work = keepers
      .filter((e) => fullMode || !existing.has(e.fileName))
      .sort(
        (a, b) =>
          a.releaseDate.localeCompare(b.releaseDate) || a.fileName.localeCompare(b.fileName),
      );
    stats.considered = work.length;
    console.log(
      `DeckList: ${all.length} Commander entries, ${stats.ce_skipped} CE skipped, ` +
        `${existing.size} already ingested → ${work.length} to fetch (${fullMode ? "FULL" : "new-only"})`,
    );

    // oracle_id → identity (id + ci for denorms, name for logs/description).
    const identityRows = await client<
      { external_key: string; id: string; ci_mask: number; name: string }[]
    >`
      SELECT external_key, id::text AS id, ci_mask, name
      FROM card_identities WHERE game_id = ${GAME_ID.mtg}`;
    const byOracle = new Map(identityRows.map((r) => [r.external_key, r]));

    const setRows = await client<{ code: string; name: string }[]>`
      SELECT code, name FROM sets WHERE game_id = ${GAME_ID.mtg}`;
    const setNames = new Map(setRows.map((r) => [r.code.toLowerCase(), r.name]));

    for (const entry of work) {
      await sleep(FETCH_GAP_MS);
      let file: unknown;
      try {
        file = await fetchJson(deckUrl(entry.fileName));
      } catch (err) {
        console.warn(`fetch failed: ${entry.fileName} — ${String(err)}`);
        skip("fetch_failed");
        continue;
      }
      stats.fetched++;

      const mapped = mapPrecon((file as { data?: unknown }).data);
      if (!mapped.ok) {
        console.warn(
          `skip ${entry.fileName}: ${mapped.skip}${mapped.detail ? ` (${mapped.detail})` : ""}`,
        );
        skip(mapped.skip);
        continue;
      }
      const { precon } = mapped;
      for (const w of precon.warnings) console.log(`  note ${entry.fileName}: ${w}`);
      stats.mapper_warnings += precon.warnings.length;

      // Any unresolved identity = an incomplete deck. Skip whole; the nightly
      // retries after Scryfall has the set (new-code path), FULL sweeps retry the rest.
      const unresolved = precon.entries.filter((e) => !byOracle.has(e.oracleId));
      if (unresolved.length > 0) {
        console.warn(
          `skip ${entry.fileName}: ${unresolved.length} identities not in card_identities yet ` +
            `(${unresolved
              .slice(0, 3)
              .map((e) => e.name)
              .join(", ")}${unresolved.length > 3 ? ", …" : ""})`,
        );
        skip("unresolved_identity");
        for (const e of unresolved.slice(0, 3)) {
          if (stats.unresolved_identity_names.length < 20)
            stats.unresolved_identity_names.push(e.name);
        }
        continue;
      }

      const sourceHash = createHash("sha256").update(preconHashPayload(precon)).digest("hex");
      const prior = existing.get(entry.fileName);
      if (prior && prior.sourceHash === sourceHash) {
        stats.unchanged++;
        continue;
      }

      // Printing ids only when that printing exists locally (else NULL, counted).
      const wanted = [
        ...new Set(precon.entries.flatMap((e) => (e.scryfallId ? [e.scryfallId] : []))),
      ];
      const printingRows = await client<{ id: string }[]>`
        SELECT id::text AS id FROM card_printings WHERE id = ANY(${wanted}::uuid[])`;
      const knownPrintings = new Set(printingRows.map((r) => r.id));

      const entriesInput: DeckCardInput[] = precon.entries.map((e) => {
        const printingId =
          e.scryfallId && knownPrintings.has(e.scryfallId) ? e.scryfallId : undefined;
        if (e.scryfallId && !printingId) stats.printings_unresolved++;
        return {
          cardId: byOracle.get(e.oracleId)!.id,
          zone: e.zone,
          qty: e.qty,
          tags: [],
          ...(printingId ? { printingId } : {}),
        };
      });

      const issues = cardListIssues(entriesInput, COMMANDER);
      if (issues.length > 0) {
        console.warn(`skip ${entry.fileName}: structural — ${issues.join("; ")}`);
        skip("structural");
        continue;
      }

      // Slug: minted once, stable forever (it IS the public URL). Only new
      // decks assign one; the set-code suffix makes collisions near-impossible,
      // the counter is the backstop.
      let slug = prior?.slug;
      if (!slug) {
        const base = preconSlug(precon.name, precon.setCode);
        slug = base;
        for (let n = 2; usedSlugs.has(slug); n++) {
          stats.slug_collisions++;
          const suffix = `_${n}`;
          slug = base.slice(0, 30 - suffix.length).replace(/_+$/, "") + suffix;
        }
        usedSlugs.add(slug);
      }

      const commanders = precon.entries.filter((e) => e.zone === "commander");
      const ciMask = commanders.reduce((m, e) => m | (byOracle.get(e.oracleId)?.ci_mask ?? 0), 0);
      const cardCount = precon.entries.reduce((n, e) => n + e.qty, 0);
      const description = preconDescription({
        ciMask,
        commanderNames: commanders.map((e) => byOracle.get(e.oracleId)?.name ?? e.name),
        setName: setNames.get(precon.setCode.toLowerCase()) ?? precon.setCode,
        setCode: precon.setCode,
        releaseDate: precon.releaseDate,
        cardCount,
      });
      const releaseAt = new Date(`${precon.releaseDate}T00:00:00Z`);
      const ciMaskByCard = new Map(
        precon.entries.map((e) => {
          const identity = byOracle.get(e.oracleId)!;
          return [identity.id, identity.ci_mask] as const;
        }),
      );

      await db.transaction(async (tx) => {
        let deckId: string;
        if (prior) {
          deckId = prior.deckId;
          await tx
            .update(decks)
            .set({ name: precon.name, description })
            .where(eq(decks.id, deckId));
        } else {
          const [row] = await tx
            .insert(decks)
            .values({
              publicId: `p_${slug}`,
              gameId: GAME_ID.mtg,
              formatId: FORMAT_ID.commander,
              name: precon.name,
              description,
              visibility: "public",
              kind: "precon",
            })
            .returning({ id: decks.id });
          deckId = row.id;
        }
        await writeDeckCards(tx, deckId, entriesInput, COMMANDER, ciMaskByCard);
        // writeDeckCards stamps updated_at = now(); product lists must never
        // look "recent" — both timestamps are the release date.
        await tx
          .update(decks)
          .set({ createdAt: releaseAt, updatedAt: releaseAt })
          .where(eq(decks.id, deckId));
        await tx
          .insert(preconProducts)
          .values({
            deckId,
            code: entry.fileName,
            slug,
            setCode: precon.setCode,
            releaseDate: precon.releaseDate,
            productName: precon.name,
            sourceHash,
          })
          .onConflictDoUpdate({
            target: preconProducts.code,
            set: {
              setCode: precon.setCode,
              releaseDate: precon.releaseDate,
              productName: precon.name,
              sourceHash,
            },
          });
      });

      if (prior) {
        stats.updated++;
        console.log(`updated ${entry.fileName} (p_${slug})`);
      } else {
        stats.ingested_new++;
        console.log(`ingested ${entry.fileName} → p_${slug} (${cardCount} cards)`);
      }
    }

    const [{ size }] = await client<{ size: string }[]>`
      SELECT pg_database_size(current_database())::text AS size`;
    stats.db_size_bytes = Number(size);
    stats.duration_ms = Date.now() - started;

    // Plain string + ::jsonb, NOT client.json(): this client is the one
    // drizzle wraps (createDb), and drizzle's driver tweaks its serializer
    // options — sql.json() Parameters crash in Bind (proven on the first
    // live run 2026-09-20). The bare-client idiom in scryfall/spellbook
    // doesn't carry over.
    await client`UPDATE ingest_runs
      SET status = 'succeeded', finished_at = now(), stats = ${JSON.stringify(stats)}::jsonb
      WHERE id = ${runId}`;
    console.log(JSON.stringify(stats, null, 2));

    const [{ n: total }] = await client<{ n: number }[]>`
      SELECT count(*)::int AS n FROM decks WHERE kind = 'precon'`;
    console.log(`precon decks in table: ${total}`);
  } catch (err) {
    const message = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.error(message);
    if (runId !== undefined) {
      await client`UPDATE ingest_runs
        SET status = 'failed', finished_at = now(), error = ${message.slice(0, 4000)}
        WHERE id = ${runId}`.catch(() => {});
    }
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();
