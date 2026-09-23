/**
 * This segment's layout exists for ONE reason (R6, C9, mirrored from
 * /c/[slug]): the existence check runs HERE, above the `loading.tsx`
 * Suspense boundary, so a junk id still answers a real HTTP 404 — thrown
 * inside the boundary, a `notFound()` renders the Warden page into a
 * streamed 200. The lookup is the same React-cached one generateMetadata
 * and the page use (`getEvent` in ./event.ts), so this adds no statement;
 * the layout returns its children untouched. ISR is untouched: the layout
 * reads only `params`.
 */
import { notFound } from "next/navigation";

import { getEvent } from "./event";

export default async function TournamentEventLayout({
  params,
  children,
}: LayoutProps<"/tournaments/[id]">) {
  const { id } = await params;
  if (!(await getEvent(id))) notFound();
  return children;
}
