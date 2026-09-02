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
import { cardListIssues, type DeckCardInput } from "@/lib/decks/cards";
import type { FrozenCard } from "@/lib/decks/diff";
import { writeDeckCards, type SavedDeckCards } from "@/lib/decks/save-cards";
import type { FormatDef } from "@/lib/games/types";

const { decks, deckCards, deckVersions, cardIdentities, cardPrintings } = schema;

/** Per-deck ceiling, enforced at write time (saves, restores' safety snapshot, forks' baseline). */
export const MAX_VERSIONS_PER_DECK = 50;
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
  createdAt: Date;
  cardCount: number;
}

export interface VersionDetail extends VersionSummary {
  cards: FrozenCard[];
}

export async function listVersions(deckId: string): Promise<VersionSummary[]> {
  const db = getDb();
  return db
    .select({
      version: deckVersions.version,
      note: deckVersions.note,
      createdAt: deckVersions.createdAt,
      cardCount: sql<number>`coalesce((select sum((c->>'qty')::int) from jsonb_array_elements(${deckVersions.cards}) c), 0)::int`,
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
      `This deck already has ${MAX_VERSIONS_PER_DECK} versions — delete an old one to save another.`,
    );
    this.name = "VersionCapError";
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
 * Freeze `cards` as the deck's next version. Caller holds the row lock
 * (lockDeck) — the count check is only safe under it.
 */
export async function insertVersion(
  tx: Tx,
  deckId: string,
  cards: readonly FrozenCard[],
  note: string | null,
): Promise<{ version: number; cardCount: number }> {
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(deckVersions)
    .where(eq(deckVersions.deckId, deckId));
  if (n >= MAX_VERSIONS_PER_DECK) throw new VersionCapError();
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

export async function deleteVersion(deckId: string, version: number): Promise<boolean> {
  const db = getDb();
  const deleted = await db
    .delete(deckVersions)
    .where(and(eq(deckVersions.deckId, deckId), eq(deckVersions.version, version)))
    .returning({ version: deckVersions.version });
  return deleted.length === 1;
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
