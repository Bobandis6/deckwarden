"use client";

/**
 * Card detail pane (P1.2): the card under the cursor — search highlight or a
 * clicked deck row. Full-card image through CardImage (R1b; the CDN and
 * attribution rules live in its docblock) — no frame hover here, the image
 * is not interactive — with the adapter's display contract providing every
 * game-flavored string.
 *
 * P2.7 adds the tag editor here (the LATER.md row's firing): when the shown
 * card has a deck entry, its tags are editable — chips with remove, an
 * add-on-Enter input, and one-click presets off the adapter's hub role
 * template (role tagging's minimal landing; editorial labels stay in the
 * adapter, nothing game-specific here).
 *
 * W6 adds the Printings collapsible (WAVE2.md D5) under the footer line:
 * closed by default, fetched from W5's /api/cards/[id]/printings on FIRST
 * open only (R2's rule — never enrich every search result). Rows cache per
 * card id in this pane instance's state, so close/reopen and card
 * round-trips never refetch; the open state and the row selection are per
 * card by derivation (a fresh sub-state per card, the pane's idiom).
 * Clicking a row PREVIEWS it in the pane image — never a deck edit; only
 * "Use this printing in deck" (rendered with the in-deck line when the card
 * has an entry, the TagEditor idiom) goes through the editor's real edit
 * path via `printing.onSetPrinting`.
 *
 * Y7a adds Swap Lab's Alternatives (./alternatives-section.tsx) between the
 * footer line and Printings, on the same terms: closed by default, asked on
 * first open, and present only when the editor hands over a `swap` — the
 * shown card is in the main list and the adapter offers alternatives.
 *
 * U4b (WAVE5 D5) lays the same pane out as the phone card sheet's body when
 * the editor hands over `sheet`: a fixed header row (the name, then the
 * type line and cost on one muted line, the frame's Close at its end), then
 * a scrolling column that grows with the point the sheet rests at: the
 * actions at the peek (Add / Remove / Swap…, each only where it applies),
 * the card image from the half, and the text, tags, the footer line,
 * Alternatives and Printings at the full point. Rendering by point (not
 * clipping) keeps the column shorter than the sheet below full, so a drag
 * up on it moves the sheet instead of scrolling the column.
 */
import { ArrowRightIcon, ArrowUpRightIcon, ChevronDownIcon, PlusIcon } from "lucide-react";
import Link from "next/link";
import { useCallback, useRef, useState, type ReactNode } from "react";

import { CardImage } from "@/components/cards/card-image";
import { AlternativesSection, type SwapEditing } from "@/components/editor/alternatives-section";
import type { SheetPoint } from "@/components/editor/editor-layout";
import { CostPips } from "@/components/deck/cost-pips";
import { Button } from "@/components/ui/button";
import { Chip, ChipRemove } from "@/components/ui/chip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { withPartner } from "@/lib/buy/links";
import { embeddablePrintingImageUrl, thumbnailUrl } from "@/lib/cards/images";
import { printingCaption, type GalleryPrinting } from "@/lib/cards/printings";
import { MAX_TAG_LENGTH, MAX_TAGS, type EditorCard } from "@/lib/decks/editor-state";
import type { GameAdapter } from "@/lib/games/types";
import { cn } from "@/lib/utils";

/** Present only when the shown card is in the deck (taggable). */
export interface TagEditing {
  tags: string[];
  onSetTags: (tags: string[]) => void;
}

/** Present only when the shown card is in the deck (its printing editable, W6). */
export interface PrintingEditing {
  /** The entry's explicit chosen printing; null = the identity's default. */
  printingId: string | null;
  onSetPrinting: (row: GalleryPrinting) => void;
}

/** W5's route shape (the gallery declares the same locally). */
interface PrintingsResponse {
  printings: GalleryPrinting[];
  total: number;
  truncated: boolean;
}

type PrintingsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "done"; rows: GalleryPrinting[]; total: number; truncated: boolean };

/**
 * The phone sheet's actions (U4b, WAVE5 D5's peek), each present only where
 * it applies; the editor decides which and what each does.
 */
export interface SheetActions {
  /** One more copy into the main list; its label says "Swap in…" at the deck's maximum. */
  add?: { label: string; onClick: () => void };
  onRemove?: () => void;
  /** Opens Swap Lab's sheet for the card. */
  onSwap?: () => void;
}

/** The phone card sheet's frame (U4b): where it rests, its Close, the actions. */
export interface CardSheet {
  point: SheetPoint;
  close: ReactNode;
  actions: SheetActions;
}

/** A sheet action: 32 px, 44 on touch. */
const SHEET_ACTION_CLASS = "pointer-coarse:h-11 pointer-coarse:px-4";

/**
 * The footer's two links (Buy, Card page): text links, 44 px targets on
 * touch in every layout — the sheet's since U4b, the md drawer's and the
 * wide pane's (a tablet at md) since LATER row 245, when the short Buy
 * (37 px of text) also took a 44 px width.
 */
const FOOTER_LINK_CLASS =
  "hover:underline pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:min-w-11 pointer-coarse:items-center pointer-coarse:justify-center";

export function CardDetailPane({
  adapter,
  card,
  tagging = null,
  printing = null,
  swap = null,
  sheet = null,
}: {
  adapter: GameAdapter;
  card: EditorCard | null;
  tagging?: TagEditing | null;
  printing?: PrintingEditing | null;
  /** Y7a: present only for a main-list card the adapter offers alternatives for. */
  swap?: SwapEditing | null;
  /** U4b: lay the pane out as the phone card sheet's body. */
  sheet?: CardSheet | null;
}) {
  // Printings sub-state (W6) lives on the pane, not a keyed child: the rows
  // cache must survive card switches (one fetch per card per pane session),
  // while the open state and the selection reset per card by derivation.
  const [printingsByCard, setPrintingsByCard] = useState<ReadonlyMap<string, PrintingsState>>(
    () => new Map(),
  );
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ cardId: string; row: GalleryPrinting } | null>(null);
  // In-flight/done guard in a ref (the gallery's rule): state updaters must
  // stay pure, and a failed fetch clears it so "Try again" is real.
  const startedRef = useRef<Set<string>>(new Set());

  const loadPrintings = useCallback((cardId: string) => {
    if (startedRef.current.has(cardId)) return;
    startedRef.current.add(cardId);
    setPrintingsByCard((prev) => new Map(prev).set(cardId, { status: "loading" }));
    void (async () => {
      try {
        const res = await fetch(`/api/cards/${cardId}/printings`);
        if (!res.ok) throw new Error(`printings API → ${res.status}`);
        const data = (await res.json()) as PrintingsResponse;
        // Default first, then the API's newest-first (the card page's order;
        // sort is stable, so the rest keep their order).
        const rows = [...data.printings].sort((a, b) => Number(b.isDefault) - Number(a.isDefault));
        setPrintingsByCard((prev) =>
          new Map(prev).set(cardId, {
            status: "done",
            rows,
            total: data.total,
            truncated: data.truncated,
          }),
        );
      } catch {
        startedRef.current.delete(cardId);
        setPrintingsByCard((prev) => new Map(prev).set(cardId, { status: "error" }));
      }
    })();
  }, []);

  if (!card) {
    const empty = (
      <div className="text-muted-foreground flex h-full items-center justify-center p-6 text-center text-sm">
        Search or click a card to see it here.
      </div>
    );
    if (!sheet) return empty;
    return (
      <>
        <div className="flex shrink-0 justify-end pt-1 pr-2">{sheet.close}</div>
        {empty}
      </>
    );
  }
  const statLine = adapter.display.statLine?.(card) ?? null;

  // A selected printing previews in the pane image WITHOUT editing (D5);
  // a different card simply has no selection.
  const selectedRow = selected?.cardId === card.id ? selected.row : null;
  const paneImage = selectedRow ? embeddablePrintingImageUrl(selectedRow, "normal") : card.image;
  const printings = printingsByCard.get(card.id) ?? null;
  const printingsOpen = openFor === card.id;

  // Everything after the name and the type line, in both layouts: the pane
  // stacks it under them, the sheet shows it at the full point.
  const details = (
    <>
      <div className="mt-2 text-sm leading-relaxed whitespace-pre-wrap">
        {adapter.display.bodyText(card)}
      </div>
      {/* key: a fresh editor (and draft) per card, not one that follows the cursor */}
      {tagging && <TagEditor key={card.id} adapter={adapter} tagging={tagging} />}

      <p className="text-muted-foreground mt-3 flex items-center justify-between text-xs">
        <span>{card.cheapestUsd !== null ? `from $${card.cheapestUsd.toFixed(2)}` : ""}</span>
        <span className="flex items-center gap-3">
          {/* Buy ↗ (W7, D6): between the price and the card-page link, only
              for games whose adapter declares buy. Plain link out; the env
              ternary folds to "noopener" while the affiliate var is unset. */}
          {adapter.capabilities.buy && (
            <a
              href={withPartner(adapter.capabilities.buy.cardUrl(card))}
              className={FOOTER_LINK_CLASS}
              target="_blank"
              rel={
                process.env.NEXT_PUBLIC_TCGPLAYER_PARTNER_BASE ? "sponsored noopener" : "noopener"
              }
            >
              Buy
              <ArrowUpRightIcon aria-hidden className="ml-0.5 inline size-3.5 align-[-0.15em]" />
            </a>
          )}
          <Link href={`/cards/${card.id}`} className={FOOTER_LINK_CLASS} target="_blank">
            Card page
            <ArrowRightIcon aria-hidden className="ml-1 inline size-3.5 align-[-0.15em]" />
          </Link>
        </span>
      </p>

      {/* Y7a: Swap Lab's Alternatives — per card (a fresh section each), asked on
          open. Its key can't be the bare card id: TagEditor, a sibling, holds that one. */}
      {swap && (
        <AlternativesSection
          key={`alternatives:${card.id}`}
          adapter={adapter}
          card={card}
          swap={swap}
        />
      )}

      {/* D5: after the footer line, closed by default. The count appears once
          fetched — the pane can't know N without the request R2 forbids
          making eagerly. */}
      <Collapsible
        className="mt-2 border-t pt-2"
        open={printingsOpen}
        onOpenChange={(open) => {
          setOpenFor(open ? card.id : null);
          if (open) loadPrintings(card.id);
        }}
      >
        <CollapsibleTrigger className="group/trigger text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded text-xs font-medium tracking-wide uppercase hover:underline pointer-coarse:min-h-11">
          Printings
          {printings?.status === "done" ? ` · ${printings.total}` : ""}
          <ChevronDownIcon
            aria-hidden
            className="size-3.5 motion-safe:transition-transform motion-safe:duration-[120ms] group-data-panel-open/trigger:rotate-180"
          />
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-1.5">
          {printings?.status === "loading" && (
            <p className="text-muted-foreground text-xs">Loading printings…</p>
          )}
          {printings?.status === "error" && (
            <p className="text-destructive text-xs">
              Couldn’t load printings.{" "}
              <button
                type="button"
                onClick={() => loadPrintings(card.id)}
                className="cursor-pointer underline"
              >
                Try again
              </button>
            </p>
          )}
          {printings?.status === "done" && (
            <PrintingsList
              key={card.id}
              adapter={adapter}
              printings={printings}
              selectedRow={selectedRow}
              onSelect={(row) => setSelected({ cardId: card.id, row })}
              printing={printing}
            />
          )}
        </CollapsibleContent>
      </Collapsible>
    </>
  );

  // Printed id first where names don't identify (P4.6): "OP15-058 ·
  // Leader — Sky Island" tells the two Enel leaders apart.
  const idBadge = adapter.display.idBadge?.(card);
  const costHtml = adapter.display.costHtml(card);

  if (sheet) {
    const { point, close, actions } = sheet;
    return (
      <>
        {/* The header row stays put while the column below it scrolls (at
            the full point); data-expanded (Base UI's, the full point)
            tightens it. pr-2: the Close's own padding lines its X up with
            the column's right edge. */}
        <div className="flex shrink-0 items-start gap-2 pt-1 pr-2 pl-4 group-data-expanded/drawer-popup:pt-0">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-base leading-6 font-medium">{card.name}</h2>
            <p className="text-muted-foreground flex min-w-0 items-center gap-1 text-sm">
              <span className="truncate">
                {idBadge ? `${idBadge} · ` : ""}
                {adapter.display.subtitle(card)}
                {statLine ? ` · ${statLine}` : ""}
              </span>
              {costHtml && (
                <>
                  <span aria-hidden>·</span>
                  <CostPips html={costHtml} className="shrink-0" />
                </>
              )}
            </p>
          </div>
          {close}
        </div>
        <div
          data-slot="sheet-column"
          className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]"
        >
          {(actions.add || actions.onRemove || actions.onSwap) && (
            <div data-slot="sheet-actions" className="mt-2 flex flex-wrap items-center gap-2">
              {actions.add && (
                <Button size="sm" className={SHEET_ACTION_CLASS} onClick={actions.add.onClick}>
                  <PlusIcon data-icon="inline-start" aria-hidden />
                  {actions.add.label}
                </Button>
              )}
              {actions.onRemove && (
                <Button
                  variant="outline"
                  size="sm"
                  className={SHEET_ACTION_CLASS}
                  onClick={actions.onRemove}
                >
                  Remove
                </Button>
              )}
              {actions.onSwap && (
                <Button
                  variant="outline"
                  size="sm"
                  className={SHEET_ACTION_CLASS}
                  onClick={actions.onSwap}
                >
                  Swap…
                </Button>
              )}
            </div>
          )}
          {/* From the half: the card, sized so it fits the half under the
              header and the actions (124 px at the half's 55 %). */}
          {point !== "peek" && (
            <CardImage
              src={paneImage}
              alt={card.name}
              width={488}
              height={680}
              className="mt-3 h-auto w-[min(60%,calc((55dvh-7.75rem)*0.7176))] rounded-[4.75%/3.5%] shadow-md"
            />
          )}
          {point === "full" && details}
        </div>
      </>
    );
  }

  return (
    <div className="p-3">
      <CardImage
        src={paneImage}
        alt={card.name}
        width={488}
        height={680}
        className="mx-auto w-full max-w-72 rounded-[4.75%/3.5%] shadow-md"
      />

      <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <h2 className="font-semibold">{card.name}</h2>
        <CostPips html={costHtml} className="text-xs" />
      </div>
      <p className="text-muted-foreground mt-0.5 text-sm">
        {idBadge ? `${idBadge} · ` : ""}
        {adapter.display.subtitle(card)}
        {statLine ? ` · ${statLine}` : ""}
      </p>
      {details}
    </div>
  );
}

/**
 * The fetched rows as a compact list (D5's sketch: thumb + set + code +
 * price — not W5's table), the "In deck:" line, and the apply button.
 * Selection is preview-only; the button is the one real edit and is enabled
 * only when the card is in the deck AND the selection differs from what the
 * deck uses (explicit choice, or the default when none).
 */
function PrintingsList({
  adapter,
  printings,
  selectedRow,
  onSelect,
  printing,
}: {
  adapter: GameAdapter;
  printings: { rows: GalleryPrinting[]; total: number; truncated: boolean };
  selectedRow: GalleryPrinting | null;
  onSelect: (row: GalleryPrinting) => void;
  printing: PrintingEditing | null;
}) {
  const { rows, total, truncated } = printings;
  // No price column for OP (P4.4): prices are 0/2,785 non-null — an all-dash
  // column would imply data we don't have. Same rule as the W5 gallery.
  const hasPrices = adapter.id !== "optcg";
  const defaultRow = rows.find((p) => p.isDefault) ?? null;
  // What the deck actually uses right now — the explicit choice, else the
  // default. Only meaningful when the card is in the deck.
  const currentId = printing ? (printing.printingId ?? defaultRow?.id ?? null) : null;
  const currentRow = currentId ? (rows.find((p) => p.id === currentId) ?? null) : null;
  const canApply =
    printing !== null && selectedRow !== null && selectedRow.id !== (currentId ?? undefined);

  return (
    <>
      <ul className="space-y-px">
        {rows.map((p) => {
          const image = embeddablePrintingImageUrl(p, "normal");
          // Same rule as search rows (R3 F6): the `small` rendition (Scryfall's,
          // or the One Piece mirror's WebP), a blank spacer otherwise.
          const thumb = thumbnailUrl(image);
          const isSelected = selectedRow?.id === p.id;
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={isSelected}
                onClick={() => onSelect(p)}
                className={cn(
                  "hover:bg-accent flex w-full cursor-pointer items-center gap-2 rounded-sm px-1 py-0.5 text-left text-xs pointer-coarse:min-h-11",
                  isSelected && "bg-muted shadow-[inset_2px_0_0_var(--color-accent-game)]",
                )}
              >
                <span
                  aria-hidden
                  data-slot="thumb"
                  className="h-9 w-[1.625rem] shrink-0 overflow-hidden rounded-[2px]"
                >
                  {thumb && (
                    <CardImage src={thumb} alt="" width={146} height={204} className="h-9 w-auto" />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {p.setName}
                  {printing && p.id === currentId && (
                    <span className="text-muted-foreground"> · In deck</span>
                  )}
                </span>
                <span className="text-muted-foreground shrink-0 uppercase">
                  {p.setCode} {p.collectorNumber}
                </span>
                {hasPrices && (
                  <span className="w-12 shrink-0 text-right tabular-nums">
                    {p.usd ? `$${p.usd}` : "—"}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
      {truncated && (
        <p className="text-muted-foreground mt-1 text-xs">
          Showing {rows.length} of {total} printings, newest first
        </p>
      )}
      {printing && (
        <div className="mt-2">
          <p className="text-muted-foreground text-xs">
            In deck:{" "}
            {printing.printingId === null
              ? `default printing${defaultRow ? ` · ${printingCaption(defaultRow)}` : ""}`
              : currentRow
                ? printingCaption(currentRow)
                : "another printing"}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-1.5"
            disabled={!canApply}
            onClick={() => {
              if (selectedRow) printing.onSetPrinting(selectedRow);
            }}
          >
            Use this printing in deck
          </Button>
          {hasPrices && (
            <p className="text-muted-foreground mt-1.5 text-xs">
              Price estimates keep using each card’s cheapest printing.
            </p>
          )}
        </div>
      )}
    </>
  );
}

function TagEditor({ adapter, tagging }: { adapter: GameAdapter; tagging: TagEditing }) {
  const [draft, setDraft] = useState("");
  const { tags, onSetTags } = tagging;

  const add = (tag: string) => {
    // onSetTags routes through the pure setTags → normalizeTags, so raw
    // input (dupes, whitespace) is safe to hand over as-is.
    if (tag.trim()) onSetTags([...tags, tag]);
    setDraft("");
  };

  const applied = new Set(tags.map((t) => t.toLowerCase()));
  const presets = (adapter.hub?.roles ?? [])
    .map((r) => r.label)
    .filter((label) => !applied.has(label.toLowerCase()));

  return (
    <div className="mt-3 border-t pt-2">
      <h3 className="text-muted-foreground text-xs font-medium">Tags in this deck</h3>
      <ul className="mt-1.5 flex flex-wrap gap-1">
        {tags.map((tag) => (
          <li key={tag}>
            <Chip shape="tag" size="sm" variant="muted">
              {tag}
              <ChipRemove
                aria-label={`Remove tag ${tag}`}
                onClick={() => onSetTags(tags.filter((t) => t !== tag))}
              />
            </Chip>
          </li>
        ))}
        {tags.length < MAX_TAGS && (
          <li>
            {/* U10a (WAVE5.md D10): the Input primitive in the tag pill's shape, the
                edge token's dashed line. U10b: it stays an Input (a text box keeps
                Input's focus ring, 16 px phone text and 44 px floor) at the tag
                Chip's 24 px, so the row is one height. */}
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  add(draft);
                }
              }}
              onBlur={() => add(draft)}
              placeholder="Add tag…"
              aria-label="Add tag"
              maxLength={MAX_TAG_LENGTH}
              size={8}
              className="h-6 w-auto rounded-full border-dashed px-2 py-0 text-xs md:text-xs dark:bg-transparent pointer-coarse:px-3"
            />
          </li>
        )}
      </ul>
      {presets.length > 0 && tags.length < MAX_TAGS && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {presets.map((label) => (
            <Chip
              key={label}
              render={<button type="button" />}
              shape="tag"
              size="sm"
              onClick={() => add(label)}
              className="text-muted-foreground hover:text-foreground"
            >
              + {label}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
