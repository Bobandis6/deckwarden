"use client";

/**
 * The card-page printings gallery (W5, WAVE2.md D4): click a printing → it
 * shows in the main spot. One provider owns `selectedPrintingId`; the hero
 * (left column, sticky on md+) and the printings table are its two client
 * leaves, and everything between them — the identity text block, legality,
 * combos — stays server-rendered, passed through as children.
 *
 * Selection IS the URL: `?printing=` through `printing-param.ts`
 * (replaceState, null server snapshot), so reload reproduces the view, the
 * canonical tag never carries it, and back/forward gain no entries. The
 * default printing renders server-side exactly as before the gallery —
 * `priority` on the hero image (the LCP element) and the smoke-pinned
 * fallback strings are load-bearing (optcg-smoke:167).
 *
 * Pin vs drawer is decided at click time with matchMedia (D4): md+ pins the
 * hero (decode off-screen → 250 ms motion-safe crossfade → aria-live
 * announcement); below md a bottom drawer shows the printing large instead
 * (the hero is scrolled away on phones). A failed image keeps the selection
 * and shows the fallback text.
 *
 * Payload: the page inlines ≤ INLINE_PRINTINGS_MAX slim rows; "Show all"
 * fetches the capped tail from /api/cards/[id]/printings, which also
 * resolves deep links to printings beyond the inline hundred. Deep links to
 * ids the card doesn't own resolve to nothing and change nothing (the W4
 * crafted-link stance).
 */
import { RotateCcwIcon } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { CardImage } from "@/components/cards/card-image";
import { CardNamePreview } from "@/components/deck/card-name-preview";
import { MD_QUERY } from "@/components/editor/use-tier";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { embeddablePrintingImageUrl, thumbnailUrl, type ImageFace } from "@/lib/cards/images";
import { printingCaption, type GalleryPrinting } from "@/lib/cards/printings";
import { cn } from "@/lib/utils";

import { usePrintingParam, writePrintingParam } from "./printing-param";

/** "Filter sets…" appears only above this many printings (D4). */
export const FILTER_MIN_PRINTINGS = 12;

interface PrintingsResponse {
  printings: GalleryPrinting[];
  total: number;
  truncated: boolean;
}

/** What the hero currently renders; lags the selection by one image decode. */
interface Displayed {
  id: string | null;
  face: ImageFace;
  src: string | null;
  /** The outgoing image, kept underneath the crossfade until the next swap. */
  underSrc: string | null;
  /** True until the first swap — the server-rendered LCP image, untouched. */
  initial: boolean;
}

type TailStatus = "idle" | "loading" | "done" | "error";

interface GalleryContextValue {
  cardName: string;
  hasPrices: boolean;
  rows: GalleryPrinting[];
  total: number;
  truncated: boolean;
  tailStatus: TailStatus;
  pinnedId: string | null;
  pinnedRow: GalleryPrinting | null;
  displayed: Displayed;
  announceText: string;
  pin: (id: string) => void;
  /** Back to the default printing — removes ?printing= outright. */
  reset: () => void;
  flip: () => void;
  activateRow: (row: GalleryPrinting) => void;
  loadAll: () => void;
}

const GalleryContext = createContext<GalleryContextValue | null>(null);

function useGallery(): GalleryContextValue {
  const value = useContext(GalleryContext);
  if (!value) throw new Error("PrintingsGallery components need the PrintingsGallery provider.");
  return value;
}

/** Decode off-screen so the swap never paints a half-loaded hero (D4). */
async function preloadImage(src: string): Promise<boolean> {
  if (typeof Image === "undefined") return true;
  const img = new Image();
  img.src = src;
  if (typeof img.decode !== "function") return true;
  try {
    await img.decode();
    return true;
  } catch {
    return false;
  }
}

export function PrintingsGallery({
  cardId,
  cardName,
  gameCode,
  printings,
  total,
  children,
}: {
  cardId: string;
  cardName: string;
  gameCode: string;
  /** Slim rows, default first then newest first — the page's ≤ 100. */
  printings: GalleryPrinting[];
  total: number;
  children: ReactNode;
}) {
  const hasPrices = gameCode !== "optcg";
  const defaultRow = useMemo(
    () => printings.find((p) => p.isDefault) ?? printings[0] ?? null,
    [printings],
  );

  const [extraRows, setExtraRows] = useState<GalleryPrinting[] | null>(null);
  const [apiMeta, setApiMeta] = useState<{ total: number; truncated: boolean } | null>(null);
  const [tailStatus, setTailStatus] = useState<TailStatus>("idle");
  const [drawerRow, setDrawerRow] = useState<GalleryPrinting | null>(null);
  const [announceText, setAnnounceText] = useState("");
  const [displayed, setDisplayed] = useState<Displayed>(() => ({
    id: defaultRow?.id ?? null,
    face: "front",
    src: defaultRow ? embeddablePrintingImageUrl(defaultRow, "normal") : null,
    underSrc: null,
    initial: true,
  }));

  // The tail appended after the inline rows keeps "default first, then newest
  // first" intact — the API is newest-first and everything new is older than
  // the inline hundred.
  const rows = useMemo(() => {
    if (!extraRows) return printings;
    const seen = new Set(printings.map((p) => p.id));
    return [...printings, ...extraRows.filter((p) => !seen.has(p.id))];
  }, [printings, extraRows]);
  const rowsById = useMemo(() => new Map(rows.map((p) => [p.id, p])), [rows]);

  const urlId = usePrintingParam();
  const pinnedId = urlId && rowsById.has(urlId) ? urlId : (defaultRow?.id ?? null);
  const pinnedRow = pinnedId ? (rowsById.get(pinnedId) ?? null) : null;

  // The id the hero last STARTED a swap for — the sync effect's no-op guard
  // (the server-rendered default never re-decodes on plain loads).
  const shownIdRef = useRef<string | null>(defaultRow?.id ?? null);
  const swapToken = useRef(0);

  const showPrinting = useCallback(async (row: GalleryPrinting, face: ImageFace) => {
    const token = ++swapToken.current;
    shownIdRef.current = row.id;
    const src = embeddablePrintingImageUrl(row, "normal", face);
    const ok = src ? await preloadImage(src) : false;
    if (token !== swapToken.current) return; // a later swap superseded this one
    setDisplayed((prev) => ({
      id: row.id,
      face,
      src: ok ? src : null,
      underSrc: prev.src,
      initial: false,
    }));
    setAnnounceText(
      `Showing ${row.setName} #${row.collectorNumber}${face === "back" ? ", back face" : ""}`,
    );
  }, []);

  // Selection → hero. One path serves clicks, the deep-link restore after
  // hydration, and tail rows resolving a previously unknown ?printing=.
  useEffect(() => {
    if (!pinnedId || pinnedId === shownIdRef.current) return;
    const row = rowsById.get(pinnedId);
    if (row) void showPrinting(row, "front");
  }, [pinnedId, rowsById, showPrinting]);

  // The in-flight/done guard lives in a ref, not the status state: state
  // updaters must stay pure (StrictMode double-invokes them), and effects may
  // not set state synchronously.
  const tailStartedRef = useRef(false);
  const loadAll = useCallback(() => {
    if (tailStartedRef.current) return;
    tailStartedRef.current = true;
    setTailStatus("loading");
    void fetch(`/api/cards/${cardId}/printings`)
      .then((res) => {
        if (!res.ok) throw new Error(`printings API → ${res.status}`);
        return res.json() as Promise<PrintingsResponse>;
      })
      .then((data) => {
        setExtraRows(data.printings);
        setApiMeta({ total: data.total, truncated: data.truncated });
        setTailStatus("done");
      })
      .catch(() => {
        tailStartedRef.current = false; // "try again" is real
        setTailStatus("error");
      });
  }, [cardId]);

  // A deep link naming a printing beyond the inline rows: fetch the tail once
  // and let it resolve. Still unknown after that → not this card's → default.
  // Deferred a tick — the kickoff isn't render work (set-state-in-effect).
  useEffect(() => {
    if (!urlId || rowsById.has(urlId) || tailStatus !== "idle") return;
    const t = setTimeout(loadAll, 0);
    return () => clearTimeout(t);
  }, [urlId, rowsById, tailStatus, loadAll]);

  const pin = useCallback(
    (id: string) => {
      writePrintingParam(id === defaultRow?.id ? null : id);
    },
    [defaultRow],
  );

  const reset = useCallback(() => {
    writePrintingParam(null);
  }, []);

  const flip = useCallback(() => {
    if (!pinnedRow) return;
    void showPrinting(pinnedRow, displayed.face === "back" ? "front" : "back");
  }, [pinnedRow, displayed.face, showPrinting]);

  // Pin vs drawer, decided at click time (D4): md+ pins the sticky hero;
  // phones get the bottom drawer instead — the hero is scrolled away there.
  const activateRow = useCallback(
    (row: GalleryPrinting) => {
      const md =
        typeof window !== "undefined" &&
        typeof window.matchMedia === "function" &&
        window.matchMedia(MD_QUERY).matches;
      if (md) pin(row.id);
      else setDrawerRow(row);
    },
    [pin],
  );

  const value = useMemo<GalleryContextValue>(
    () => ({
      cardName,
      hasPrices,
      rows,
      total: apiMeta?.total ?? total,
      truncated: apiMeta?.truncated ?? false,
      tailStatus,
      pinnedId,
      pinnedRow,
      displayed,
      announceText,
      pin,
      reset,
      flip,
      activateRow,
      loadAll,
    }),
    [
      cardName,
      hasPrices,
      rows,
      apiMeta,
      total,
      tailStatus,
      pinnedId,
      pinnedRow,
      displayed,
      announceText,
      pin,
      reset,
      flip,
      activateRow,
      loadAll,
    ],
  );

  return (
    <GalleryContext.Provider value={value}>
      {children}
      <PrintingDrawer
        row={drawerRow}
        cardName={cardName}
        hasPrices={hasPrices}
        onClose={() => setDrawerRow(null)}
      />
    </GalleryContext.Provider>
  );
}

/**
 * The hero column: the pinned printing large, its caption, Flip (only with a
 * back face), Reset to default. Sticky from md so a long table scrolls under
 * a visible main image — what makes "click → shows in the main spot" legible.
 */
export function PrintingsHero() {
  const { cardName, pinnedRow, displayed, announceText, reset, flip } = useGallery();
  const hasDefault = pinnedRow !== null || displayed.id !== null;

  return (
    <div className="relative -mt-20 shrink-0 self-start md:sticky md:top-4 md:-mt-24">
      <div className="relative">
        {!displayed.initial && displayed.underSrc && (
          // eslint-disable-next-line @next/next/no-img-element -- CDN hotlink by design (CardImage docblock); decoded underlay for the crossfade.
          <img
            src={displayed.underSrc}
            alt=""
            aria-hidden
            width={488}
            height={680}
            className="absolute inset-0 w-72 rounded-2xl"
          />
        )}
        <CardImage
          key={displayed.initial ? "hero" : `${displayed.id}:${displayed.face}:${displayed.src}`}
          src={displayed.src}
          alt={cardName}
          width={488}
          height={680}
          priority
          className={cn(
            "relative w-72 rounded-2xl shadow-lg",
            !displayed.initial &&
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-[250ms]",
          )}
          fallback={hasDefault ? "Card image coming soon" : "No image"}
        />
      </div>
      {pinnedRow && (
        <div className="mt-3 w-72 text-sm">
          <p className="font-medium">{pinnedRow.setName}</p>
          <p className="text-muted-foreground">
            {printingCaption(pinnedRow)}
            {pinnedRow.year ? ` · ${pinnedRow.year}` : ""}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {pinnedRow.isDefault ? (
              <span className="bg-muted text-muted-foreground rounded-md px-1.5 py-0.5 text-xs">
                Default
              </span>
            ) : (
              <Button variant="outline" size="sm" onClick={reset}>
                Reset to default
              </Button>
            )}
            {pinnedRow.hasBack && (
              <Button variant="outline" size="sm" onClick={flip}>
                <RotateCcwIcon aria-hidden className="size-3.5" />
                Flip
              </Button>
            )}
          </div>
        </div>
      )}
      <p aria-live="polite" className="sr-only">
        {announceText}
      </p>
    </div>
  );
}

/**
 * The printings section: heading with count, "Filter sets…" above
 * FILTER_MIN_PRINTINGS, the aria-pressed rows, and the Show-all tail. Table
 * semantics stay (D4) — the Set cell's button stretches over the row with an
 * after:inset-0 overlay, so the row is the target and the cells stay cells.
 */
export function PrintingsTable() {
  const {
    cardName,
    hasPrices,
    rows,
    total,
    truncated,
    tailStatus,
    pinnedId,
    activateRow,
    loadAll,
  } = useGallery();
  const [filter, setFilter] = useState("");

  const needle = filter.trim().toLowerCase();
  const visibleRows = needle
    ? rows.filter((p) => `${p.setName} ${p.setCode}`.toLowerCase().includes(needle))
    : rows;

  return (
    <>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Printings · {total}</h2>
        {total > FILTER_MIN_PRINTINGS && (
          <label className="text-muted-foreground text-sm">
            <span className="sr-only">Filter sets</span>
            <Input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter sets…"
              className="h-8 w-44"
            />
          </label>
        )}
      </div>
      <div className="mt-2 overflow-x-auto">
        {/* No price columns for OP (P4.4): prices are 0/2,785 non-null —
            two all-dash columns would imply data we don't have. */}
        <table className={`w-full text-sm ${hasPrices ? "min-w-[28rem]" : ""}`}>
          <thead>
            <tr className="text-muted-foreground border-b text-left">
              <th className="py-1.5 pr-4 font-medium">Set</th>
              <th className="py-1.5 pr-4 font-medium">#</th>
              <th className="py-1.5 pr-4 font-medium">Rarity</th>
              {hasPrices && (
                <>
                  <th className="py-1.5 pr-4 font-medium">USD</th>
                  <th className="py-1.5 font-medium">Foil</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((p) => (
              <PrintingRow
                key={p.id}
                printing={p}
                cardName={cardName}
                hasPrices={hasPrices}
                pinned={p.id === pinnedId}
                onActivate={activateRow}
              />
            ))}
          </tbody>
        </table>
        {needle && visibleRows.length === 0 && (
          <p className="text-muted-foreground mt-2 text-sm">
            No loaded sets match “{filter.trim()}”.
          </p>
        )}
      </div>
      {tailStatus === "done" && truncated ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Showing {rows.length} of {total} printings — newest first
        </p>
      ) : rows.length < total ? (
        <div className="mt-2 flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={loadAll}
            disabled={tailStatus === "loading"}
            aria-busy={tailStatus === "loading"}
          >
            {tailStatus === "loading" ? "Loading…" : `Show all ${total} printings`}
          </Button>
          {tailStatus === "error" && (
            <span className="text-destructive text-xs">Couldn’t load — try again</span>
          )}
        </div>
      ) : null}
    </>
  );
}

function PrintingRow({
  printing,
  cardName,
  hasPrices,
  pinned,
  onActivate,
}: {
  printing: GalleryPrinting;
  cardName: string;
  hasPrices: boolean;
  pinned: boolean;
  onActivate: (row: GalleryPrinting) => void;
}) {
  const image = embeddablePrintingImageUrl(printing, "normal");
  // Same rule as search rows (R3 F6): `small` for the Scryfall CDN, a blank
  // spacer for everything else — One Piece included, until the
  // img.deckwarden.gg flip decides OP thumbnail sizing.
  const thumb = thumbnailUrl(image);

  return (
    <tr
      className={cn(
        "hover:bg-accent relative border-b transition-colors duration-[120ms] last:border-0",
        pinned && "bg-muted",
      )}
    >
      <td
        className={cn(
          "py-1.5 pr-4",
          // The 2 px game-accent rule on the pinned row — an inset shadow, so
          // no layout shift against its neighbors.
          pinned && "shadow-[inset_2px_0_0_var(--color-accent-game)]",
        )}
      >
        <CardNamePreview name={cardName} image={image} caption={printingCaption(printing)}>
          <button
            type="button"
            aria-pressed={pinned}
            onClick={() => onActivate(printing)}
            className="focus-visible:outline-accent-game flex items-center gap-2 text-left after:absolute after:inset-0 focus-visible:outline-2 focus-visible:-outline-offset-2"
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
            <span className="min-w-0">
              {printing.setName}
              {pinned && <span className="text-muted-foreground text-xs"> · Shown</span>}
            </span>
          </button>
        </CardNamePreview>
      </td>
      <td className="py-1.5 pr-4 uppercase">
        {printing.setCode} {printing.collectorNumber}
      </td>
      <td className="py-1.5 pr-4 capitalize">{printing.rarity ?? "—"}</td>
      {hasPrices && (
        <>
          <td className="py-1.5 pr-4">{printing.usd ? `$${printing.usd}` : "—"}</td>
          <td className="py-1.5">{printing.usdFoil ? `$${printing.usdFoil}` : "—"}</td>
        </>
      )}
    </tr>
  );
}

/**
 * The phone path (D4): tap a row → this bottom drawer, reusing ui/drawer.tsx
 * as-is. Large image, set line, prices; the footer is W7's buy slot — empty
 * until W7 ships real links (no dead controls).
 */
function PrintingDrawer({
  row,
  cardName,
  hasPrices,
  onClose,
}: {
  row: GalleryPrinting | null;
  cardName: string;
  hasPrices: boolean;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={row !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      showSwipeHandle
    >
      <DrawerContent aria-label="Printing details">
        {row && (
          <div className="pb-6">
            <DrawerHeader>
              <DrawerTitle>{row.setName}</DrawerTitle>
              <DrawerDescription>
                {printingCaption(row)}
                {row.year ? ` · ${row.year}` : ""}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex justify-center px-4 pt-3">
              <CardImage
                src={embeddablePrintingImageUrl(row, "normal")}
                alt={cardName}
                width={488}
                height={680}
                className="w-60 rounded-xl shadow-md"
                fallback="Card image coming soon"
              />
            </div>
            {hasPrices && (row.usd || row.usdFoil) && (
              <p className="mt-3 text-center text-sm">
                {row.usd ? `$${row.usd}` : "—"}
                {row.usdFoil ? ` · foil $${row.usdFoil}` : ""}
              </p>
            )}
            {/* W7's buy slot lands here (D4's [ Buy ↗ ]). */}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
