"use client";

/**
 * Generic analytics renderer (P1.5): draws the adapter contract's four
 * AnalyticsBlock kinds — histogram, breakdown, stat, table. Blocks are DATA
 * (build plan §3); this component knows nothing game-specific. Colors come
 * only from each bucket/slice's optional colorVar (a CSS custom property the
 * theme defines, e.g. --mana-u), falling back to the neutral chart color.
 * Plain CSS bars — no chart library. P1.7's share pages reuse AnalyticsBlocks
 * directly; AnalyticsPanel is the editor's collapsible wrapper around it
 * (on the Collapsible primitive since R3).
 *
 * R6 (G6): each histogram bar grows in from the baseline on mount — a
 * `motion-safe:` transition from an `@starting-style` state (Tailwind's
 * `starting:` variant), so the deal plays without JavaScript, on the
 * server-rendered share page and the hub's staples curve alike, and never
 * exists for a reduced-motion reader; the value label above each bar is
 * unchanged. (G9): a histogram block may carry an editorial `target` —
 * drawn as a dashed outline behind each bar, scaled on the same max as the
 * bars, `aria-hidden`, and named by ONE visible legend line — so the
 * renderer draws whatever target a block hands it and still knows nothing
 * about which game or template produced it.
 *
 * U6 (WAVE5 D7): `variant="share"` is the share page's open look, no
 * tracks: each histogram as thin bars (10 px, in the brand's chart color)
 * over no baseline, a target's outline a thin box behind its bar; each
 * breakdown as ONE stacked bar with a legend instead of a row per slice on
 * a filled track. A slice keeps its own `colorVar`; the others take the
 * chart colors in order (the adapter sorts them largest first) and the
 * smallest, past the fifth, muted ink at 40 %. Segments sit 1 px apart,
 * each with a faint inset edge so a pale one (White on ivory) still shows
 * its box; the bar is aria-hidden and the legend says every count. The
 * editor and the hub keep the panel look.
 */
import { ChevronDownIcon } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { AnalyticsBlock } from "@/lib/games/types";
import { cn } from "@/lib/utils";

/** The panel's look (the editor, the hub) or the share page's (U6). */
export type AnalyticsVariant = "panel" | "share";

function barColor(colorVar: string | undefined, fallback = "--chart-2"): string {
  return colorVar ? `var(${colorVar})` : `var(${fallback})`;
}

/** The chart colors a stacked bar walks for slices without their own, largest first (U6). */
const STACK_COLORS = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"] as const;
/** The smallest slices' ink (U6, D7): muted at 40 %, mixed in oklab (an oklch mix with transparent casts hue 0, U3b). */
export const STACK_REST_COLOR = "color-mix(in oklab, var(--muted-foreground) 40%, transparent)";

function sliceColor(colorVar: string | undefined, index: number): string {
  if (colorVar) return `var(${colorVar})`;
  return index < STACK_COLORS.length ? `var(${STACK_COLORS[index]})` : STACK_REST_COLOR;
}

/** A segment's and a swatch's faint inset edge (U6): a pale slice keeps its box on ivory. */
const SEGMENT_EDGE_CLASS = "ring-foreground/15 ring-1 ring-inset";

/** The bar's grow-in (G6): from `scale-y-0` at first style to full height, ≤ 400 ms, motion-safe only. */
export const HISTOGRAM_BAR_MOTION_CLASS =
  "origin-bottom scale-y-100 motion-safe:transition-transform motion-safe:duration-400 motion-safe:ease-settle-400 motion-safe:starting:scale-y-0";

/** The dashed outline that draws a target bucket and the legend's swatch (G9). */
const TARGET_OUTLINE_CLASS =
  "border-muted-foreground/60 rounded-t-sm border border-b-0 border-dashed";

function Histogram({
  block,
  thin,
}: {
  block: Extract<AnalyticsBlock, { kind: "histogram" }>;
  /** The share page's look (U6): thin bars, no baseline, a capped width. */
  thin: boolean;
}) {
  const target = block.target;
  // One scale for bars AND target, so a template bucket never overflows the
  // track while the deck is small.
  const max = Math.max(...block.buckets.map((b) => b.value), ...(target?.values ?? []), 1);
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{block.title}</h3>
      <div className={cn("mt-1 flex items-stretch gap-1", thin && "max-w-md")}>
        {block.buckets.map((bucket, i) => {
          const ghost = target?.values[i] ?? 0;
          return (
            <div key={bucket.label} className="min-w-0 flex-1 text-center">
              <div className="type-micro text-muted-foreground tabular-nums">
                {bucket.value > 0 ? bucket.value : " "}
              </div>
              <div
                className={cn(
                  "relative flex h-16 items-end",
                  thin ? "justify-center" : "border-border border-b",
                )}
              >
                {ghost > 0 && (
                  <div
                    aria-hidden
                    data-slot="histogram-target"
                    className={`pointer-events-none absolute bottom-0 ${thin ? "left-1/2 w-4 -translate-x-1/2" : "inset-x-0"} ${TARGET_OUTLINE_CLASS}`}
                    style={{ height: `${(ghost / max) * 100}%` }}
                  />
                )}
                <div
                  data-slot="histogram-bar"
                  className={`relative ${thin ? "w-2.5" : "w-full"} rounded-t-sm ${HISTOGRAM_BAR_MOTION_CLASS}`}
                  style={{
                    // Nonzero buckets stay visible even next to a tall max.
                    height: bucket.value > 0 ? `${Math.max((bucket.value / max) * 100, 5)}%` : 0,
                    background: barColor(bucket.colorVar, thin ? "--chart-1" : "--chart-2"),
                  }}
                />
              </div>
              <div className="type-micro text-muted-foreground mt-0.5">{bucket.label}</div>
            </div>
          );
        })}
      </div>
      {target && (
        <p
          data-slot="histogram-legend"
          className="type-micro text-muted-foreground mt-1 flex items-center gap-1.5"
        >
          <span aria-hidden className={`inline-block h-2.5 w-3 ${TARGET_OUTLINE_CLASS}`} />
          {target.label}
        </p>
      )}
    </div>
  );
}

function Breakdown({ block }: { block: Extract<AnalyticsBlock, { kind: "breakdown" }> }) {
  const max = Math.max(...block.slices.map((s) => s.value), 1);
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{block.title}</h3>
      <ul className="mt-1 space-y-1">
        {block.slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground w-20 shrink-0 truncate">{slice.label}</span>
            <span className="bg-muted h-2.5 flex-1 overflow-hidden rounded-sm">
              <span
                className="block h-full rounded-sm"
                style={{
                  width: `${(slice.value / max) * 100}%`,
                  background: barColor(slice.colorVar),
                }}
              />
            </span>
            <span className="w-7 shrink-0 text-right tabular-nums">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * A breakdown on the share page (U6, D7): one stacked bar, a segment per
 * slice in proportion, 1 px apart, then a legend of label and count. The
 * bar is a picture of the legend, so it is aria-hidden; nothing is drawn
 * behind it.
 */
function StackedBreakdown({ block }: { block: Extract<AnalyticsBlock, { kind: "breakdown" }> }) {
  const slices = block.slices.filter((slice) => slice.value > 0);
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{block.title}</h3>
      {slices.length > 0 && (
        <div
          aria-hidden
          data-slot="breakdown-bar"
          className="mt-1.5 flex h-3 gap-px overflow-hidden rounded-sm"
        >
          {slices.map((slice, i) => (
            <span
              key={slice.label}
              data-slot="breakdown-segment"
              className={cn("h-full min-w-0.5 basis-0", SEGMENT_EDGE_CLASS)}
              style={{ flexGrow: slice.value, background: sliceColor(slice.colorVar, i) }}
            />
          ))}
        </div>
      )}
      <ul data-slot="breakdown-legend" className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {slices.map((slice, i) => (
          <li key={slice.label} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("size-2.5 shrink-0 rounded-sm", SEGMENT_EDGE_CLASS)}
              style={{ background: sliceColor(slice.colorVar, i) }}
            />
            <span>{slice.label}</span>
            <span className="text-muted-foreground tabular-nums">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STAT_TONE = {
  ok: "text-emerald-700 dark:text-emerald-400",
  warn: "text-amber-700 dark:text-amber-400",
  bad: "text-destructive",
} as const;

/**
 * The tone's word (R6, status never color-only): a stat's tone used to be a
 * hue on its number alone; now a small visible word rides beside it — the
 * validation vocabulary, so "Problem" here means what it means there.
 */
export const STAT_TONE_WORD = { ok: "OK", warn: "Warning", bad: "Problem" } as const;

function Stat({ block }: { block: Extract<AnalyticsBlock, { kind: "stat" }> }) {
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{block.title}</h3>
      <p
        className={`text-sm font-semibold tabular-nums ${block.tone ? STAT_TONE[block.tone] : ""}`}
      >
        {block.value}
        {block.tone && (
          <span data-slot="stat-tone" className="type-micro ml-1.5">
            {STAT_TONE_WORD[block.tone]}
          </span>
        )}
      </p>
      {block.hint && <p className="type-micro text-muted-foreground">{block.hint}</p>}
    </div>
  );
}

function DataTable({ block }: { block: Extract<AnalyticsBlock, { kind: "table" }> }) {
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{block.title}</h3>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted-foreground border-border border-b text-left">
              {block.columns.map((col, i) => (
                <th key={col} className={`py-0.5 pr-2 font-medium ${i > 0 ? "text-right" : ""}`}>
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {block.rows.map((row, r) => (
              <tr key={r} className="border-border/50 border-b last:border-b-0">
                {row.map((cell, c) => (
                  <td
                    key={c}
                    className={`py-0.5 pr-2 ${typeof cell === "number" ? "text-right tabular-nums" : ""}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.hint && <p className="type-micro text-muted-foreground mt-1">{block.hint}</p>}
    </div>
  );
}

/** The bare block list — stats gather into one tile row, other kinds stack. */
export function AnalyticsBlocks({
  blocks,
  variant = "panel",
}: {
  blocks: AnalyticsBlock[];
  /** "share" (U6): thin curve bars and stacked breakdowns, no tracks. */
  variant?: AnalyticsVariant;
}) {
  const share = variant === "share";
  const stats = blocks.filter((b) => b.kind === "stat");
  const rest = blocks.filter((b) => b.kind !== "stat");
  return (
    <div className="space-y-3">
      {stats.length > 0 && (
        <div className="flex flex-wrap gap-x-6 gap-y-2">
          {stats.map((b) => (
            <Stat key={b.id} block={b} />
          ))}
        </div>
      )}
      {rest.map((b) =>
        b.kind === "histogram" ? (
          <Histogram key={b.id} block={b} thin={share} />
        ) : b.kind === "breakdown" ? (
          share ? (
            <StackedBreakdown key={b.id} block={b} />
          ) : (
            <Breakdown key={b.id} block={b} />
          )
        ) : (
          <DataTable key={b.id} block={b} />
        ),
      )}
    </div>
  );
}

/**
 * The editor's labelled collapsible (R3 puts it on the Collapsible
 * primitive — a real `aria-expanded` trigger, closed by default as before,
 * state not persisted). The block renderer above stays generic: analytics
 * are data, not components.
 */
export function AnalyticsPanel({ blocks }: { blocks: AnalyticsBlock[] }) {
  if (blocks.length === 0) return null;
  return (
    <Collapsible className="mt-4">
      <CollapsibleTrigger className="group/trigger text-muted-foreground hover:text-foreground flex items-center gap-1.5 rounded text-xs font-medium tracking-wide uppercase hover:underline pointer-coarse:min-h-11">
        Analytics
        <ChevronDownIcon
          aria-hidden
          className="size-3.5 motion-safe:transition-transform motion-safe:duration-[120ms] group-data-panel-open/trigger:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <AnalyticsBlocks blocks={blocks} />
      </CollapsibleContent>
    </Collapsible>
  );
}
