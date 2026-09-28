"use client";

/**
 * NameSuggest (X2, WAVE3.md D2): the predictive name box — the input and its
 * dropdown over GET /api/cards/suggest. One island, three boxes: the
 * /commanders and /leaders GET forms (uncontrolled, `name="q"`, a footer row
 * that submits the form) and the /cards Name box (controlled by its grid's
 * `q`, no form, no footer).
 *
 * It owns the three things D2 gives it: the 150 ms debounce, the abort of a
 * stale request, and the request key — `nameKey(text)`, THE normalizer's
 * output, so "Sol", "sol" and "sol " are one request and one edge-cache key,
 * and one normalized letter sends nothing. A request goes out only once the
 * box has asked to open (the reader typed), so a page that lands with `?q=`
 * filled in costs no suggest call.
 *
 * D0's popup rules, and how each is met:
 * - Opens at two characters: the popup is controlled — Base UI asks to open
 *   on any typed character, and `open` also needs NAME_MIN_CHARS and an
 *   answer to show.
 * - At most 8 rows (the route's limit), 44 px on coarse pointers, as wide as
 *   the input and never under 18 rem (ui/autocomplete.tsx).
 * - While a request is in flight the previous rows stay; the rows reset only
 *   when the text drops below two characters, so a new query never flashes
 *   an old one's rows.
 * - "No matches" is one quiet line; a failed request closes the popup and
 *   the box keeps working (the form, the grid).
 * - Nothing is highlighted until an arrow key: `highlightItemOnHover` is off
 *   (hover is CSS only), so a resting pointer never arms Enter. Enter with no
 *   highlight closes the popup and does what the box did before — Base UI
 *   leaves the keydown alone, so the browser submits the form (or, on
 *   /cards, nothing happens). Esc closes and keeps the text (Base UI
 *   prevents the default, so a search input's native Esc-clear does not
 *   run); a second Esc, with the popup shut, clears the box as it always did.
 * - A `role="status"` line, mounted outside the popup, announces the count.
 * - Leaving the box before the first answer lands withdraws the request to
 *   open (Base UI dismisses on focus-out only once the popup is open), so a
 *   late answer never pops a list up beside a box nobody is in.
 *
 * Inside a form (`name` set) the island also renders an invisible default
 * submit button: Base UI's Root adds a second, unnamed text input, and HTML
 * implicit submission ignores Enter in a form with two text fields and no
 * submit button — with or without script (measured in the pane).
 *
 * A pick navigates: every row is a `Link` (no prefetch — rows churn while
 * typing), and Base UI lets a link row follow its href without writing the
 * row's text into the box (verified in jsdom). So a pick never rewrites `q`
 * — on /cards the grid is not re-run on the way out. The footer row is the
 * one non-link row; its value stringifies to the current text, so Base UI's
 * fill-on-press is a no-op, and its click submits the owning form.
 *
 * `mode="none"`: the server ranked and filtered; Base UI neither re-filters
 * (its default `contains` filter drops Urza's Saga for "urzas saga") nor
 * re-orders.
 */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { CardImage } from "@/components/cards/card-image";
import { ColorChipList } from "@/components/color-chip";
import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompleteStatus,
} from "@/components/ui/autocomplete";
import { NAME_MIN_CHARS, nameKey } from "@/lib/search/name-key";
import type { SuggestResponse, SuggestRow } from "@/lib/search/suggest";
import { cn } from "@/lib/utils";

export const SUGGEST_DEBOUNCE_MS = 150;

const FOOTER = { footer: true } as const;
type Entry = SuggestRow | typeof FOOTER;

export interface NameSuggestProps {
  game: "mtg" | "optcg";
  /** "leaders": leader candidates with a hub (the index boxes); "cards": every card. */
  scope: "cards" | "leaders";
  /** Where a row goes: `prefix` + the row's slug or id ("/c/" + slug, "/cards/" + id). */
  rowHref: { prefix: string; key: "slug" | "id" };
  /** The row's one quiet detail: color chips, the type line, or the card number. */
  detail: "colors" | "type" | "number";
  /** The input's form name (the GET forms: "q"). */
  name?: string;
  id?: string;
  /** Uncontrolled initial text (the forms echo the server's `?q=`). */
  defaultValue?: string;
  /** Controlled text (/cards: the grid's `q`). */
  value?: string;
  onValueChange?: (value: string) => void;
  /** "Show every <noun> matching “…”" — a last row that submits the owning form. */
  footerNoun?: string;
  placeholder?: string;
  autoFocus?: boolean;
  type?: "search" | "text";
  /** Replaces the input's look (ui/autocomplete.tsx `unstyled`); omitted = the shadcn Input look. */
  inputClassName?: string;
  "aria-label"?: string;
}

function rowHref(row: SuggestRow, target: NameSuggestProps["rowHref"]): string | null {
  const key = target.key === "slug" ? row.slug : row.id;
  return key ? `${target.prefix}${encodeURIComponent(key)}` : null;
}

export function NameSuggest({
  game,
  scope,
  rowHref: target,
  detail,
  name,
  id,
  defaultValue,
  value,
  onValueChange,
  footerNoun,
  placeholder,
  autoFocus,
  type = "search",
  inputClassName,
  "aria-label": ariaLabel,
}: NameSuggestProps) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const text = value ?? inner;
  const key = nameKey(text);
  const active = key.length >= NAME_MIN_CHARS;

  /** The reader's intent, from Base UI's open requests (typing, Esc, outside press…). */
  const [want, setWant] = useState(false);
  /** The latest answer and the key it answered. */
  const [answer, setAnswer] = useState<{ key: string; rows: SuggestRow[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const answerKey = answer?.key ?? null;
  useEffect(() => {
    if (!want || key.length < NAME_MIN_CHARS || key === answerKey) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ game, scope, q: key });
        const res = await fetch(`/api/cards/suggest?${params}`, { signal: controller.signal });
        if (!res.ok) throw new Error(`Suggest failed (${res.status})`);
        const json = (await res.json()) as SuggestResponse;
        if (controller.signal.aborted) return;
        setAnswer({ key, rows: json.results });
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      }
    }, SUGGEST_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [want, key, answerKey, game, scope]);

  const rows = (answer?.rows ?? []).filter((row) => rowHref(row, target) !== null);
  const open = want && active && answer !== null && !failed;
  const entries: Entry[] = footerNoun ? [...rows, FOOTER] : rows;
  const typed = text.trim();

  const handleValueChange = (next: string) => {
    if (nameKey(next).length < NAME_MIN_CHARS) {
      setAnswer(null);
      setFailed(false);
    }
    if (value === undefined) setInner(next);
    onValueChange?.(next);
  };

  return (
    <Autocomplete
      items={entries}
      mode="none"
      value={text}
      onValueChange={handleValueChange}
      open={open}
      onOpenChange={setWant}
      highlightItemOnHover={false}
      itemToStringValue={(entry: Entry) => ("footer" in entry ? text : entry.name)}
      name={name}
    >
      <AutocompleteInput
        ref={inputRef}
        id={id}
        type={type}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        onBlur={() => {
          if (!open) setWant(false);
        }}
        unstyled={inputClassName !== undefined}
        className={inputClassName}
      />
      {name && (
        // Base UI's Root renders a second, unnamed TEXT input beside this one
        // (its form-value mirror). HTML implicit submission refuses a form
        // with two text fields and no submit button — measured in the pane:
        // Enter submitted nothing, with the popup open or shut, and a
        // script-less form could not be submitted at all. This invisible
        // default button is what Enter now "clicks". Rendered (sr-only, not
        // `hidden`): WebKit skips a default button that has no box.
        <button type="submit" tabIndex={-1} aria-hidden className="sr-only" />
      )}
      <AutocompleteStatus>
        {open
          ? rows.length
            ? `${rows.length} suggestion${rows.length === 1 ? "" : "s"}`
            : "No matches"
          : ""}
      </AutocompleteStatus>
      <AutocompleteContent data-slot="name-suggest-popup">
        {rows.length === 0 && (
          <p className="text-muted-foreground px-1.5 py-1 text-sm">No matches</p>
        )}
        <AutocompleteList>
          {(entry: Entry) =>
            "footer" in entry ? (
              <FooterRow
                key="footer"
                noun={footerNoun ?? ""}
                typed={typed}
                separated={rows.length > 0}
                onPick={() => inputRef.current?.form?.requestSubmit()}
              />
            ) : (
              <AutocompleteItem
                key={entry.id}
                value={entry}
                render={<Link href={rowHref(entry, target)!} prefetch={false} />}
                onClick={(e) => {
                  // A plain pick leaves the page: close now rather than
                  // while the next route loads. A new-tab click keeps it.
                  if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) setWant(false);
                }}
              >
                <span
                  aria-hidden
                  data-slot="thumb"
                  className="h-9 w-[1.625rem] shrink-0 overflow-hidden rounded-[2px]"
                >
                  {entry.image && (
                    <CardImage
                      src={entry.image}
                      alt=""
                      width={146}
                      height={204}
                      className="h-9 w-auto"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.name}</span>
                <RowDetail row={entry} detail={detail} game={game} />
              </AutocompleteItem>
            )
          }
        </AutocompleteList>
      </AutocompleteContent>
    </Autocomplete>
  );
}

function RowDetail({
  row,
  detail,
  game,
}: {
  row: SuggestRow;
  detail: NameSuggestProps["detail"];
  game: NameSuggestProps["game"];
}) {
  if (detail === "colors") {
    return (
      <ColorChipList
        game={game}
        mask={game === "mtg" ? row.ciMask : row.colorsMask}
        className="text-xs"
      />
    );
  }
  const text = detail === "number" ? row.externalKey : row.typeLine;
  if (!text) return null;
  return (
    <span
      className={cn(
        "text-muted-foreground max-w-[45%] shrink-0 truncate text-xs",
        detail === "number" && "tabular-nums",
      )}
    >
      {text}
    </span>
  );
}

/**
 * D2's last row on the index boxes: submits the owning GET form — the same
 * list Enter with no highlight asks for, which is always a superset of the
 * rows above it (the list accepts classes 1–4 and near misses). A border,
 * not a separator element: a listbox may only own options.
 */
function FooterRow({
  noun,
  typed,
  separated,
  onPick,
}: {
  noun: string;
  typed: string;
  separated: boolean;
  onPick: () => void;
}) {
  return (
    <AutocompleteItem
      value={FOOTER}
      onClick={onPick}
      className={cn("text-muted-foreground", separated && "mt-1 rounded-t-none border-t")}
    >
      {/* Wraps rather than truncates: at the 18 rem floor the sentence is
          already longer than one line, and the typed text is its point. */}
      <span className="min-w-0 flex-1 wrap-break-word">
        Show every {noun} matching “{typed}”
      </span>
      <span aria-hidden className="text-xs">
        ↵
      </span>
    </AutocompleteItem>
  );
}
