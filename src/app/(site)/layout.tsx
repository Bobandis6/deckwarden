/**
 * The (site) route group (R1b, REDESIGN.md §2): every public page except
 * the editor routes (/decks/new, /decks/[id]/edit) stands in this shell,
 * which adds the site header above each page. URLs are unchanged — a route
 * group is invisible — and the root layout still wraps everything (theme,
 * fonts), so there is one root layout and no full-page reloads. The site
 * footer renders HERE since R4 (below every page in the group), not in the
 * root layout, so the editor routes — outside the group — go without it.
 *
 * Plain and synchronous ON PURPOSE. Nothing here may read request data —
 * no headers(), cookies(), searchParams, connection() or noStore(): /c/,
 * /l/ and /cards/[id] are ISR (generateStaticParams + revalidate), and any
 * request-bound read in a shared layout would silently render them
 * dynamically on every hit. The header's account slot reads the session
 * client-side for exactly this reason.
 *
 * Caching intent: inert — each page keeps its own mode (static, ISR, or
 * force-dynamic).
 */
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";

// Typed as "/": next typegen folds a route group into its URL path, so this
// layout and the root one share the key (verified 2026-09-09, Next 16.3.2).
export default function SiteLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <SiteHeader />
      {children}
      <SiteFooter />
    </>
  );
}
