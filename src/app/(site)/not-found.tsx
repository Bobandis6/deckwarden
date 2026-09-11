/**
 * The (site) group's 404 (R5b, F8): what a `notFound()` thrown inside the
 * group renders — /c/, /l/, /cards/[id], /d/, /u/, /f/ and the rest — under
 * the group layout, whose site header is already on the page, so this file
 * adds none (the root `not-found.tsx` does, for unmatched URLs). Same body,
 * same status: Next answers 404 for either file (hubs-smoke and
 * profile-folders-smoke pin the status on the wire).
 */
import { WardenNotFound } from "@/components/warden-not-found";

export const metadata = { title: "Page not found" };

export default function SiteNotFound() {
  return <WardenNotFound />;
}
