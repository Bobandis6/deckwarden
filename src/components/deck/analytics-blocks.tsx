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
 */
import { ChevronDownIcon } from "lucide-react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { AnalyticsBlock } from "@/lib/games/types";

function barColor(colorVar?: string): string {
  return colorVar ? `var(${colorVar})` : "var(--chart-2)";
}

/** The bar's grow-in (G6): from `scale-y-0` at first style to full height, ≤ 400 ms, motion-safe only. */
export const HISTOGRAM_BAR_MOTION_CLASS =
  "origin-bottom scale-y-100 motion-safe:transition-transform motion-safe:duration-400 motion-safe:ease-out motion-safe:starting:scale-y-0";

/** The dashed outline that draws a target bucket and the legend's swatch (G9). */
const TARGET_OUTLINE_CLASS =
  "border-muted-foreground/60 rounded-t-sm border border-b-0 border-dashed";

function Histogram({ block }: { block: Extract<AnalyticsBlock, { kind: "histogram" }> }) {
  const target = block.target;
  // One scale for bars AND target, so a template bucket never overflows the
  // track while the deck is small.
  const max = Math.max(...block.buckets.map((b) => b.value), ...(target?.values ?? []), 1);
  return (
    <div>
      <h3 className="text-muted-foreground text-xs font-medium">{block.title}</h3>
      <div className="mt-1 flex items-stretch gap-1">
        {block.buckets.map((bucket, i) => {
          const ghost = target?.values[i] ?? 0;
          return (
            <div key={bucket.label} className="min-w-0 flex-1 text-center">
              <div className="text-muted-foreground text-[0.65rem] tabular-nums">
                {bucket.value > 0 ? bucket.value : " "}
              </div>
              <div className="border-border relative flex h-16 items-end border-b">
                {ghost > 0 && (
                  <div
                    aria-hidden
                    data-slot="histogram-target"
                    className={`pointer-events-none absolute inset-x-0 bottom-0 ${TARGET_OUTLINE_CLASS}`}
                    style={{ height: `${(ghost / max) * 100}%` }}
                  />
                )}
                <div
                  data-slot="histogram-bar"
                  className={`relative w-full rounded-t-sm ${HISTOGRAM_BAR_MOTION_CLASS}`}
                  style={{
                    // Nonzero buckets stay visible even next to a tall max.
                    height: bucket.value > 0 ? `${Math.max((bucket.value / max) * 100, 5)}%` : 0,
                    background: barColor(bucket.colorVar),
                  }}
                />
              </div>
              <div className="text-muted-foreground mt-0.5 text-[0.65rem]">{bucket.label}</div>
            </div>
          );
        })}
      </div>
      {target && (
        <p
          data-slot="histogram-legend"
          className="text-muted-foreground mt-1 flex items-center gap-1.5 text-[0.65rem]"
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
          <span data-slot="stat-tone" className="ml-1.5 text-[0.65rem] font-medium">
            {STAT_TONE_WORD[block.tone]}
          </span>
        )}
      </p>
      {block.hint && <p className="text-muted-foreground text-[0.65rem]">{block.hint}</p>}
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
    </div>
  );
}

/** The bare block list — stats gather into one tile row, other kinds stack. */
export function AnalyticsBlocks({ blocks }: { blocks: AnalyticsBlock[] }) {
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
          <Histogram key={b.id} block={b} />
        ) : b.kind === "breakdown" ? (
          <Breakdown key={b.id} block={b} />
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
          className="size-3.5 motion-safe:transition-transform motion-safe:duration-150 group-data-panel-open/trigger:rotate-180"
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2">
        <AnalyticsBlocks blocks={blocks} />
      </CollapsibleContent>
    </Collapsible>
  );
}
