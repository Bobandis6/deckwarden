/**
 * The capabilities strip (R5a, §2 item 5): five short cards, copy only for
 * features that have shipped — validation (P1.x), Commander Spellbook
 * combos (P2.5, Magic), share pages (P1.7/P2.6), sample hands (P2.7, both
 * games — seven cards for Magic, five for One Piece since P4.6), and
 * tournament finishes (P3.5 Topdeck.gg, P4.5 Limitless). Three bodies are
 * P2.8's FEATURES copy where it still read true. Cold-start rule: no
 * numbers, no testimonials.
 */
const CAPABILITIES: Array<{ title: string; body: string }> = [
  {
    title: "The Warden checks your work",
    body: "Format legality, color identity, copy limits, and banned cards validated as you build — every flag comes with the reason, not just an ✗.",
  },
  {
    title: "Combos, surfaced",
    body: "Commander hubs and Magic card pages show their Commander Spellbook combos beside staples, curve templates, and budget tiers.",
  },
  {
    title: "Share pages that sell the deck",
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

export function CapabilitiesStrip() {
  return (
    <section
      aria-label="What Deckwarden does"
      className="grid w-full gap-3 sm:grid-cols-2 lg:grid-cols-5"
    >
      {CAPABILITIES.map((c) => (
        <div key={c.title} className="rounded-lg border p-3">
          <h2 className="text-sm font-semibold">{c.title}</h2>
          <p className="text-muted-foreground mt-1 text-xs">{c.body}</p>
        </div>
      ))}
    </section>
  );
}
