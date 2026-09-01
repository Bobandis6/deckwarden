/**
 * Combo rows for card pages and commander hubs (P2.5). Pure server render
 * of ComboView data — zero client state, so host pages stay ISR-cacheable.
 * Each row deep-links to its external walkthrough page (P3.3: built by the
 * adapter's combos capability, no hardcoded source here): that's both the
 * attribution and the step-by-step walkthrough we deliberately don't store
 * (lean rows — the Neon budget).
 */
import Link from "next/link";

import type { ComboView } from "@/lib/combos/queries";
import type { GameAdapter } from "@/lib/games/types";

export function ComboList({
  combos,
  combosMeta,
  anchorCardId,
}: {
  combos: ComboView[];
  /** The game's combo-source declaration (attribution + deep-link builder). */
  combosMeta: NonNullable<GameAdapter["capabilities"]["combos"]>;
  /** The page's own card: rendered as plain text instead of a self-link. */
  anchorCardId?: string;
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
          <p className="mt-1 text-xs">
            <a
              href={combosMeta.externalUrl(combo.externalKey)}
              className="text-muted-foreground underline"
              rel="noreferrer"
              target="_blank"
            >
              How it works on {combosMeta.sourceLabel} ↗
            </a>
          </p>
        </li>
      ))}
    </ul>
  );
}
