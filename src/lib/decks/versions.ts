/**
 * Deck versions (P3.6) — named frozen snapshots in deck_versions, provisioned
 * in P1.1 exactly so this package needs no migration.
 *
 * When a version is born (decision 1): only on an explicit "Save version"
 * (the plan's NAMED versions — the note is the name) and on restore, where
 * the current list is snapshotted first as a safety version so a restore is
 * always reversible by another restore. Autosaves never mint versions: a
 * debounced PUT per second would fill the cap in a minute and bury the
 * milestones the user chose to name. A fork also writes its version 1 from
 * the upstream list at fork time (forks.ts).
 *
 * Concurrency: decks.current_version is the counter (the highest number
 * ever minted, never reused — deleting v7 doesn't renumber v8) and the
 * unique (deck_id, version) index is the guard. Writers lock the deck row
 * (SELECT ... FOR UPDATE) so the count-check + increment + insert are
 * serialized; the unique index would surface a bug as a 500, never as a
 * silently overwritten snapshot.
 *
 * Neon math, out loud (decision 6): a 100-card snapshot is ~7KB of JSONB
 * (~100 × {two uuids, zone, qty, tags}; TOAST compresses it to ~2-3KB on
 * disk). Versions are the first table that grows with USER activity rather
 * than with the card corpus: growth ≈ decks × versions-per-deck × ~5KB.
 * MAX_VERSIONS_PER_DECK bounds the per-deck worst case at ~350KB; 10,000
 * versions across the user base is ~50MB. The nightly db:size gauge (alert
 * at 350MB; 219MB on 2026-09-01) is the tripwire, and the cap is surfaced
 * in the UI — when it's hit the user deletes an old version, nothing is
 * evicted behind their back.
 *
 * Played snapshots (Y9a, WAVE4 D10): a logged game freezes the list it was
 * played with — reusing the newest version whose playable-list hash
 * (list-hash.ts, stamped by insertVersion) matches, or minting a `played`
 * version. The 50 cap counts `saved` versions only; `played` ones have
 * their own allowance (MAX_PLAYED_SNAPSHOTS_PER_DECK), so a game never
 * blocks Save version or Restore. A version a logged game was played with
 * is never deleted from History (deleteVersion refuses it); a played
 * snapshot goes with its last game (src/lib/journal/games.ts).
 *
 * Restore (decision 2) is ONE transaction — safety snapshot, then the frozen
 * list replaces deck_cards through writeDeckCards, the same code path the
 * editor's PUT uses, so leader_ids/ci_mask can't drift between the two
 * writers. Frozen ids are resolved first: ingest never hard-deletes
 * identities or printings (it flips is_removed, and removed identities still
 * resolve by design — a deck may keep a card that left the corpus), but the
 * JSONB has no FK, so a printing that ever vanishes falls back to the
 * identity's default printing (NULL) and an identity that vanishes is
 * dropped; both are counted and returned so the UI can say so.
 */
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { getDb, schema, type DbExecutor, type Tx } from "@/db";
import type { DeckVersionKind } from "@/db/schema";
import { cardListIssues, type DeckCardInput } from "@/lib/decks/cards";
import type { FrozenCard } from "@/lib/decks/diff";
import { playableListHash } from "@/lib/decks/list-hash";
import { MAX_PLAYED_SNAPSHOTS_PER_DECK } from "@/lib/journal/limits";
import { writeDeckCards, type SavedDeckCards } from "@/lib/decks/save-cards";
import type { FormatDef } from "@/lib/games/types";

const { decks, deckCards, deckVersions, deckGames, cardIdentities, cardPrintings } = schema;

/**
 * Per-deck ceiling on `saved` versions, enforced at write time (saves,
 * restores' safety snapshot, forks' baseline). Played snapshots don't count.
 */
export const MAX_VERSIONS_PER_DECK = 50;
/**
 * Played snapshots' own per-deck allowance (Y9a, src/lib/journal/limits.ts):
 * at it a game still logs, with no version of its own. Worst case ~100 ×
 * 3 KB on disk per deck.
 */
export { MAX_PLAYED_SNAPSHOTS_PER_DECK };
export const MAX_VERSION_NOTE_LENGTH = 200;

/** The frozen shape (schema.ts): [{cardId, zone, qty, tags, printingId}]. */
const FROZEN_CARDS = z.array(
  z.object({
    cardId: z.uuid(),
    zone: z.string().min(1),
    qty: z.number().int().min(1),
    tags: z.array(z.string()).default([]),
    printingId: z.uuid().nullable().default(null),
  }),
);

/** URL segment -> version number; anything that isn't a plain positive int is a 404. */
export function parseVersionParam(raw: string): number | null {
  return /^[1-9]\d{0,8}$/.test(raw) ? Number(raw) : null;
}

/** Reads a stored snapshot; throws on a malformed row (only our own code writes them). */
export function parseFrozenCards(json: unknown): FrozenCard[] {
  return FROZEN_CARDS.parse(json);
}

export function toFrozenCards(
  rows: readonly {
    cardIdentityId: string;
    zone: string;
    quantity: number;
    tags: string[];
    printingId: string | null;
  }[],
): FrozenCard[] {
  return rows.map((r) => ({
    cardId: r.cardIdentityId,
    zone: r.zone,
    qty: r.quantity,
    tags: r.tags,
    printingId: r.printingId,
  }));
}

export function frozenToInputs(frozen: readonly FrozenCard[]): DeckCardInput[] {
  return frozen.map((c) => ({
    cardId: c.cardId,
    zone: c.zone,
    qty: c.qty,
    tags: c.tags,
    ...(c.printingId ? { printingId: c.printingId } : {}),
  }));
}

export interface VersionSummary {
  version: number;
  note: string | null;
  /** saved = the owner's (counts toward the cap) · played = a logged game's list (Y9a). */
  kind: DeckVersionKind;
  createdAt: Date;
  cardCount: number;
}

export interface VersionDetail extends VersionSummary {
  cards: FrozenCard[];
}

/** The versions list, newest first, with each row's playable-list hash (Y10: the versions GET's "No card changes since vN"). */
export async function listVersions(
  deckId: string,
): Promise<(VersionSummary & { listHash: string | null })[]> {
  const db = getDb();
  return db
    .select({
      version: deckVersions.version,
      note: deckVersions.note,
      kind: deckVersions.kind,
      createdAt: deckVersions.createdAt,
      cardCount: sql<number>`coalesce((select sum((c->>'qty')::int) from jsonb_array_elements(${deckVersions.cards}) c), 0)::int`,
      listHash: deckVersions.listHash,
    })
    .from(deckVersions)
    .where(eq(deckVersions.deckId, deckId))
    .orderBy(desc(deckVersions.version));
}

export async function loadVersion(
  executor: DbExecutor,
  deckId: string,
  version: number,
): Promise<VersionDetail | null> {
  const [row] = await executor
    .select({
      version: deckVersions.version,
      note: deckVersions.note,
      kind: deckVersions.kind,
      createdAt: deckVersions.createdAt,
      cards: deckVersions.cards,
    })
    .from(deckVersions)
    .where(and(eq(deckVersions.deckId, deckId), eq(deckVersions.version, version)))
    .limit(1);
  if (!row) return null;
  const cards = parseFrozenCards(row.cards);
  return {
    version: row.version,
    note: row.note,
    kind: row.kind,
    createdAt: row.createdAt,
    cards,
    cardCount: cards.reduce((n, c) => n + c.qty, 0),
  };
}

/** The live list in the frozen shape (ordered so snapshots are byte-stable). */
export async function loadLiveFrozen(executor: DbExecutor, deckId: string): Promise<FrozenCard[]> {
  const rows = await executor
    .select({
      cardIdentityId: deckCards.cardIdentityId,
      zone: deckCards.zone,
      quantity: deckCards.quantity,
      tags: deckCards.tags,
      printingId: deckCards.printingId,
    })
    .from(deckCards)
    .where(eq(deckCards.deckId, deckId))
    .orderBy(asc(deckCards.zone), asc(deckCards.cardIdentityId));
  return toFrozenCards(rows);
}

export class VersionCapError extends Error {
  constructor() {
    super(
      `This deck already has ${MAX_VERSIONS_PER_DECK} versions. Delete an old one to save another.`,
    );
    this.name = "VersionCapError";
  }
}

/** At the played allowance (Y9a): the caller logs the game without a version of its own. */
export class PlayedAllowanceError extends Error {
  constructor() {
    super(`This deck already keeps ${MAX_PLAYED_SNAPSHOTS_PER_DECK} played lists.`);
    this.name = "PlayedAllowanceError";
  }
}

/** Lock the deck row for the rest of the transaction; serializes every version writer. */
export async function lockDeck(tx: Tx, deckId: string): Promise<boolean> {
  const rows = await tx
    .select({ id: decks.id })
    .from(decks)
    .where(eq(decks.id, deckId))
    .for("update");
  return rows.length === 1;
}

/**
 * Freeze `cards` as the deck's next version, stamped with its playable-list
 * hash. Caller holds the row lock (lockDeck) — the count check is only safe
 * under it. Each kind counts against its own ceiling: `saved` the 50 cap
 * (VersionCapError), `played` the allowance (PlayedAllowanceError).
 */
export async function insertVersion(
  tx: Tx,
  deckId: string,
  cards: readonly FrozenCard[],
  note: string | null,
  kind: DeckVersionKind = "saved",
): Promise<{ version: number; cardCount: number }> {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(deckVersions)
    .where(and(eq(deckVersions.deckId, deckId), eq(deckVersions.kind, kind)));
  if (kind === "saved" && n >= MAX_VERSIONS_PER_DECK) throw new VersionCapError();
  if (kind === "played" && n >= MAX_PLAYED_SNAPSHOTS_PER_DECK) throw new PlayedAllowanceError();
  const [bumped] = await tx
    .update(decks)
    .set({ currentVersion: sql`${decks.currentVersion} + 1` })
    .where(eq(decks.id, deckId))
    .returning({ version: decks.currentVersion });
  await tx.insert(deckVersions).values({
    deckId,
    version: bumped.version,
    note,
    cards: cards as unknown as object,
    listHash: playableListHash(cards),
    kind,
  });
  return { version: bumped.version, cardCount: cards.reduce((c, e) => c + e.qty, 0) };
}

/** "Save version": snapshot the live list under a note. */
export async function saveVersion(
  deckId: string,
  note: string | null,
): Promise<{ version: number; cardCount: number }> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockDeck(tx, deckId);
    const cards = await loadLiveFrozen(tx, deckId);
    return insertVersion(tx, deckId, cards, note);
  });
}

/**
 * Delete one version — unless a logged game was played with it (Y9a): a
 * game always knows its exact list, so that version stays while the game
 * does. Under the deck lock, like every writer: a game being logged
 * against this version either commits first (and the version stays) or
 * waits and finds it gone (and mints its own).
 */
export async function deleteVersion(
  deckId: string,
  version: number,
): Promise<"deleted" | "in_use" | "not_found"> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockDeck(tx, deckId);
    const deleted = await tx
      .delete(deckVersions)
      .where(
        and(
          eq(deckVersions.deckId, deckId),
          eq(deckVersions.version, version),
          sql`not exists (select 1 from ${deckGames} where ${deckGames.deckId} = ${deckId} and ${deckGames.version} = ${version})`,
        ),
      )
      .returning({ version: deckVersions.version });
    if (deleted.length === 1) return "deleted" as const;
    const [still] = await tx
      .select({ version: deckVersions.version })
      .from(deckVersions)
      .where(and(eq(deckVersions.deckId, deckId), eq(deckVersions.version, version)))
      .limit(1);
    return still ? ("in_use" as const) : ("not_found" as const);
  });
}

export interface ResolvedFrozen {
  entries: DeckCardInput[];
  /** Entries whose chosen printing no longer exists (or moved cards): reset to the default printing. */
  printingsReset: number;
  /** Entries whose identity no longer exists in this game: dropped. */
  cardsDropped: number;
}

/**
 * Pure: reconcile a frozen list against what exists now. `knownCardIds` is
 * the set of identities that resolve in the deck's game; `printingOwner`
 * maps existing printing ids to their identity. is_removed rows are still
 * "known" by design.
 */
export function resolveFrozenCards(
  frozen: readonly FrozenCard[],
  knownCardIds: ReadonlySet<string>,
  printingOwner: ReadonlyMap<string, string>,
): ResolvedFrozen {
  let printingsReset = 0;
  let cardsDropped = 0;
  const entries: DeckCardInput[] = [];
  for (const c of frozen) {
    if (!knownCardIds.has(c.cardId)) {
      cardsDropped++;
      continue;
    }
    let printingId = c.printingId ?? undefined;
    if (printingId && printingOwner.get(printingId) !== c.cardId) {
      printingId = undefined;
      printingsReset++;
    }
    entries.push({
      cardId: c.cardId,
      zone: c.zone,
      qty: c.qty,
      tags: c.tags,
      ...(printingId ? { printingId } : {}),
    });
  }
  return { entries, printingsReset, cardsDropped };
}

export type RestoreResult =
  | ({
      ok: true;
      restoredVersion: number;
      /** The pre-restore safety snapshot's number. */
      safetyVersion: number;
      count: number;
      printingsReset: number;
      cardsDropped: number;
    } & SavedDeckCards)
  | { ok: false; error: "not_found" }
  | { ok: false; error: "cap" }
  | { ok: false; error: "invalid"; issues: string[] };

export async function restoreVersion(
  deck: { id: string; gameId: number },
  version: number,
  format: FormatDef,
): Promise<RestoreResult> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await lockDeck(tx, deck.id);
    const target = await loadVersion(tx, deck.id, version);
    if (!target) return { ok: false, error: "not_found" } as const;

    const cardIds = [...new Set(target.cards.map((c) => c.cardId))];
    const printingIds = [
      ...new Set(target.cards.flatMap((c) => (c.printingId ? [c.printingId] : []))),
    ];
    const [identityRows, printingRows] = await Promise.all([
      cardIds.length > 0
        ? tx
            .select({ id: cardIdentities.id, ciMask: cardIdentities.ciMask })
            .from(cardIdentities)
            .where(and(inArray(cardIdentities.id, cardIds), eq(cardIdentities.gameId, deck.gameId)))
        : Promise.resolve([]),
      printingIds.length > 0
        ? tx
            .select({ id: cardPrintings.id, cardIdentityId: cardPrintings.cardIdentityId })
            .from(cardPrintings)
            .where(inArray(cardPrintings.id, printingIds))
        : Promise.resolve([]),
    ]);
    const ciMaskByCard = new Map(identityRows.map((r) => [r.id, r.ciMask]));
    const resolved = resolveFrozenCards(
      target.cards,
      new Set(ciMaskByCard.keys()),
      new Map(printingRows.map((r) => [r.id, r.cardIdentityId])),
    );
    const issues = cardListIssues(resolved.entries, format);
    if (issues.length > 0) return { ok: false, error: "invalid", issues } as const;

    // Safety snapshot BEFORE the replace, so the restore itself is undoable.
    const live = await loadLiveFrozen(tx, deck.id);
    let safety: { version: number };
    try {
      safety = await insertVersion(tx, deck.id, live, `Before restoring v${version}`);
    } catch (err) {
      if (err instanceof VersionCapError) return { ok: false, error: "cap" } as const;
      throw err;
    }

    const saved = await writeDeckCards(tx, deck.id, resolved.entries, format, ciMaskByCard);
    return {
      ok: true,
      restoredVersion: version,
      safetyVersion: safety.version,
      count: resolved.entries.length,
      printingsReset: resolved.printingsReset,
      cardsDropped: resolved.cardsDropped,
      ...saved,
    };
  });
}

/** Names for rendering a diff (the frozen shape carries ids only). */
export async function cardNamesById(
  executor: DbExecutor,
  ids: readonly string[],
): Promise<Record<string, string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return {};
  const rows = await executor
    .select({ id: cardIdentities.id, name: cardIdentities.name })
    .from(cardIdentities)
    .where(inArray(cardIdentities.id, unique));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}
