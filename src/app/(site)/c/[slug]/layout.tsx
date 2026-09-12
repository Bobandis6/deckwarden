/**
 * This segment's layout exists for ONE reason (R6, C9): the existence check
 * runs HERE, above the `loading.tsx` Suspense boundary, so an unknown
 * slug still answers a real HTTP 404. Thrown inside the boundary, a
 * `notFound()` renders the Warden page into a streamed 200 — the shell has
 * already been sent (Next's not-found docs: "the resource has to be checked
 * before the response streams"). The lookup is the same React-cached one
 * `generateMetadata` and the page await (`getLeader` in ./leader.ts), so this adds no
 * statement; the layout returns its children untouched. Not a route: the
 * route table is unchanged. ISR is untouched: the layout reads only `params`.
 */
import { notFound } from "next/navigation";

import { getLeader } from "./leader";

export default async function CommanderHubLayout({ params, children }: LayoutProps<"/c/[slug]">) {
  const { slug } = await params;
  if (!(await getLeader(slug))) notFound();
  return children;
}
