/**
 * This segment's layout exists for ONE reason (R6, C9): the existence check
 * runs HERE, above the `loading.tsx` Suspense boundary, so an unknown
 * public id still answers a real HTTP 404. Thrown inside the boundary, a
 * `notFound()` renders the Warden page into a streamed 200 — the shell has
 * already been sent (Next's not-found docs: "the resource has to be checked
 * before the response streams"). The lookup is the same React-cached one
 * `generateMetadata` and the page await (`getDeck` in ./deck.ts), so this adds no
 * statement; the layout returns its children untouched. Not a route: the
 * route table is unchanged. Force-dynamic stays the page's call; a private deck passes through to the page's client gate.
 */
import { notFound } from "next/navigation";

import { getDeck } from "./deck";

export default async function DeckShareLayout({ params, children }: LayoutProps<"/d/[publicId]">) {
  const { publicId } = await params;
  if (!(await getDeck(publicId))) notFound();
  return children;
}
