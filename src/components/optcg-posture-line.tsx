/**
 * The One Piece attribution/posture line (P4.1, extracted P4.6) — required
 * wherever OP card images or data render: Bandai's cardlist footer wording,
 * the unofficial-fan-content statement, and the sourcing link. Was inlined on
 * /cards and /cards/[id]; P4.6 adds the deck share page (an OP deck's share
 * page is mostly OP card images) and shares the one copy.
 */
import Link from "next/link";

export function OptcgPostureLine({ className }: { className?: string }) {
  return (
    <p className={className ?? "text-muted-foreground mt-12 text-xs"}>
      ©Eiichiro Oda/Shueisha, Toei Animation · ONE PIECE CARD GAME ©BANDAI. Deckwarden is unofficial
      fan content, not affiliated with or endorsed by Bandai, Shueisha, or Toei Animation. No
      official card-data API exists for the One Piece Card Game —{" "}
      <Link href="/legal#one-piece" className="underline">
        how we source this data
      </Link>
      .
    </p>
  );
}
