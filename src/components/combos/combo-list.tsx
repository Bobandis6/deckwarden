/**
 * Combo rows for card pages and commander hubs (P2.5). Pure server render
 * of ComboView data — zero client state, so host pages stay ISR-cacheable.
 * Each row deep-links to its external walkthrough page (P3.3: built by the
 * adapter's combos capability, no hardcoded source here): that's both the
 * attribution and the step-by-step walkthrough we deliberately don't store
 * (lean rows — the Neon budget).
 *
 * X3 (WAVE3.md D3): `buildHref` adds the combo door, "Build around this
 * combo", beside the walkthrough link — a plain link in the server HTML,
 * so the hub stays ISR. The hub passes it only where its own build CTA
 * renders (a legal commander, an adapter that declares autofill); card
 * pages pass none (no commander, no fit filter — LATER row 113).
 */
import { ArrowUpRightIcon } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import type { ComboView } from "@/lib/combos/queries";
import type { GameAdapter } from "@/lib/games/types";
import { cn } from "@/lib/utils";

export function ComboList({
  combos,
  combosMeta,
  anchorCardId,
  buildHref,
}: {
  combos: ComboView[];
  /** The game's combo-source declaration (attribution + deep-link builder). */
  combosMeta: NonNullable<GameAdapter["capabilities"]["combos"]>;
  /** The page's own card: rendered as plain text instead of a self-link. */
  anchorCardId?: string;
  /** The combo door's draft link (X3) — absent: no door on any row. */
  buildHref?: (combo: ComboView) => string;
}) {
  return (
    <ul className="mt-2 space-y-2">
      {combos.map((combo) => (
        <li key={combo.id} className="rounded-lg border px-3 py-2">
          <p className="text-sm leading-relaxed font-medium">
            {combo.pieces.map((piece, i) => (
              <span key={piece.id}>
                {i > 0 && <span className="text-muted-foreground font-normal"> + </span>}
                {piece.id === anchorCardId ? (
                  piece.name
                ) : (
                  <Link href={`/cards/${piece.id}`} className="hover:underline">
                    {piece.name}
                  </Link>
                )}
              </span>
            ))}
            {combo.templates.map((template) => (
              <span key={template} className="text-muted-foreground font-normal">
                {" "}
                + {template}
              </span>
            ))}
          </p>
          {combo.results.length > 0 && (
            <p className="text-muted-foreground mt-1 text-xs">{combo.results.join(" · ")}</p>
          )}
          <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p className="text-xs">
              <a
                href={combosMeta.externalUrl(combo.externalKey)}
                className="text-muted-foreground underline"
                rel="noreferrer"
                target="_blank"
              >
                How it works on {combosMeta.sourceLabel}
                <ArrowUpRightIcon aria-hidden className="ml-0.5 inline size-3.5 align-[-0.15em]" />
              </a>
            </p>
            {buildHref && (
              // A link styled as a small button: it navigates, so it stays an
              // anchor; no prefetch — up to ten doors per page, one is clicked.
              <Link
                href={buildHref(combo)}
                prefetch={false}
                className={cn(buttonVariants({ variant: "outline", size: "xs" }))}
              >
                Build around this combo
              </Link>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
