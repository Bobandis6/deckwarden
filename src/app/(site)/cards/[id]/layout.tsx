/**
 * This segment's layout exists for ONE reason (R6, C9): the existence check
 * runs HERE, above the `loading.tsx` Suspense boundary, so an unknown
 * card id still answers a real HTTP 404. Thrown inside the boundary, a
 * `notFound()` renders the Warden page into a streamed 200 — the shell has
 * already been sent (Next's not-found docs: "the resource has to be checked
 * before the response streams"). The lookup is the same React-cached one
 * `generateMetadata` and the page await (`getCard` in ./card.ts), so this adds no
 * statement; the layout returns its children untouched. Not a route: the
 * route table is unchanged. ISR is untouched: the layout reads only `params`.
 */
import { notFound } from "next/navigation";

import { getCard } from "./card";

export default async function CardPageLayout({ params, children }: LayoutProps<"/cards/[id]">) {
  const { id } = await params;
  if (!(await getCard(id))) notFound();
  return children;
}
