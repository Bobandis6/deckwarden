/**
 * Root 404 (P1.8; the Warden page since R5b, F8) — renders for every
 * unmatched URL, inside the root layout ALONE: this file sits outside the
 * (site) group, so it carries the site header — and, since R4, the footer
 * — itself (a lost visitor needs somewhere to go). A `notFound()` thrown inside the group takes
 * `(site)/not-found.tsx` instead, which renders the same body under the
 * group layout's own header. Static by nature; no data fetching (the
 * header's account slot reads the session client-side, as everywhere).
 * HTTP status stays 404 — Next sets it for this file.
 */
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { WardenNotFound } from "@/components/warden-not-found";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <WardenNotFound />
      <SiteFooter />
    </>
  );
}
