/**
 * Site-wide footer (P1.8 gate): attribution + disclaimer + legal/privacy/
 * contact links. Rendered from the root layout; on app-like full-height pages
 * (the editor) it sits below the fold, which is intentional.
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
        <a
          href="https://github.com/Bobandis6/deckwarden/issues"
          className="hover:text-foreground underline"
          rel="noreferrer"
          target="_blank"
        >
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
