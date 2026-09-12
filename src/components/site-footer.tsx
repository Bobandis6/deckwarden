/**
 * Site-wide footer (P1.8 gate): attribution + disclaimer + legal/privacy/
 * contact links. Rendered by the (site) layout on every public page and by
 * the three headerless shells outside the group (the new-deck picker, the
 * root 404, the error page) — NOT on the editor routes since R4, where a
 * fixed-viewport workspace has no below-the-fold; the editor's tools
 * content ends with a compact per-game attribution instead
 * (EditorAttribution). The appearance menu it hosted in R1a moved into the
 * site header (R1b) and the editor's own header (R3).
 */
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="text-muted-foreground border-t px-4 py-6 text-center text-xs">
      <p>
        Card data and images courtesy of{" "}
        <a href="https://scryfall.com" className="underline" rel="noreferrer" target="_blank">
          Scryfall
        </a>
        . Deckwarden is unofficial Fan Content permitted under the Fan Content Policy — not approved
        or endorsed by Wizards of the Coast.
      </p>
      <p className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        <Link href="/legal" className="hover:text-foreground underline">
          Legal
        </Link>
        <Link href="/privacy" className="hover:text-foreground underline">
          Privacy
        </Link>
        {/* Email, not GitHub issues (P2.8 follow-up): no account needed, and
            privacy/takedown requests shouldn't be public posts. Bug reports
            still have the GitHub link next door. */}
        <a href="mailto:contact@deckwarden.gg" className="hover:text-foreground underline">
          Contact
        </a>
        <a
          href="https://github.com/Bobandis6/deckwarden"
          className="hover:text-foreground underline"
          rel="noreferrer"
          target="_blank"
        >
          GitHub
        </a>
      </p>
    </footer>
  );
}
