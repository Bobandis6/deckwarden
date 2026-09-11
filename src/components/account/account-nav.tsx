/**
 * AccountNav (R5b, REDESIGN.md §2 "Account"): the in-page navigation of
 * /account's three sections — Decks · Collection import · Settings — as a
 * labelled `<nav>` of anchor links whose targets are the sections' ids.
 * Not sticky: the page is one or two screens for any account this side of
 * the deck cap, so a jump list is enough. Server-rendered (no state).
 */
import { navLinkClass } from "@/components/site-nav-link";

export const ACCOUNT_SECTIONS = [
  { id: "decks", label: "Decks" },
  { id: "collection", label: "Collection import" },
  { id: "settings", label: "Settings" },
] as const;

export type AccountSectionId = (typeof ACCOUNT_SECTIONS)[number]["id"];

export function AccountNav({ className }: { className?: string }) {
  return (
    <nav aria-label="Account sections" className={className}>
      <ul className="flex flex-wrap items-center gap-1 border-b pb-2">
        {ACCOUNT_SECTIONS.map((section) => (
          <li key={section.id}>
            <a href={`#${section.id}`} className={navLinkClass}>
              {section.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
