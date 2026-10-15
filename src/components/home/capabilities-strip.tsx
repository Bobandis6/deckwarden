/**
 * What Deckwarden does (R5a, §2 item 5; an offset list since U5, WAVE5 D6
 * section 6): five plain items, copy only for features that have shipped —
 * validation (P1.x), Commander Spellbook combos (P2.5, Magic), share pages
 * (P1.7/P2.6), sample hands (P2.7, both games — seven cards for Magic, five
 * for One Piece since P4.6), and tournament finishes (P3.5 Topdeck.gg, P4.5
 * Limitless). The serif heading sits on the left and the items in the right
 * half under a gold rule, as a description list (title, body): no cards, no
 * per-item headings. The titles are D6's plain ones; the bodies are R5a's
 * (U9 owns their dashes). Cold-start rule: no numbers, no testimonials.
 */
import { cn } from "@/lib/utils";

const CAPABILITIES: Array<{ title: string; body: string }> = [
  {
    title: "Legality checks",
    body: "Format legality, color identity, copy limits, and banned cards validated as you build — every flag comes with the reason, not just an ✗.",
  },
  {
    title: "Combos",
    body: "Commander hubs and Magic card pages show their Commander Spellbook combos beside staples, curve templates, and budget tiers.",
  },
  {
    title: "Share pages",
    body: "Every deck gets a fast mobile-friendly page with curve, prices, and a share image that unfurls in Discord — with the commander's art for Magic.",
  },
  {
    title: "Sample hands",
    body: "Deal an opening hand in the builder or on any share page — seven cards for Magic, five for One Piece — and mulligan until it reads right.",
  },
  {
    title: "Tournament finishes",
    body: "Commander hubs carry recent Top 16 results from Topdeck.gg; One Piece leader pages carry theirs from Limitless.",
  },
];

export function CapabilitiesStrip({ className }: { className?: string }) {
  return (
    <section
      aria-label="What Deckwarden does"
      className={cn("grid gap-8 md:grid-cols-2 md:gap-12", className)}
    >
      <h2 className="type-section">What Deckwarden does</h2>
      <dl className="border-gold/30 space-y-5 border-t pt-6">
        {CAPABILITIES.map((c) => (
          <div key={c.title}>
            <dt className="font-medium">{c.title}</dt>
            <dd className="text-muted-foreground mt-1 text-sm">{c.body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
