/**
 * This segment's layout exists for ONE reason (R6, C9): the existence check
 * runs HERE, before anything of the page can stream, so an unknown slug
 * answers a real HTTP 404 (Next's not-found docs: "the resource has to be
 * checked before the response streams"; a `notFound()` thrown after the
 * shell has gone out renders the Warden page into a streamed 200, which
 * `hubs-smoke`'s two 404 pins caught in R6). The hub's `loading.tsx` is
 * gone since VIEW-TRANSITIONS (2026-11-03, LATER row 395's experiment a):
 * a route-level Suspense boundary made every client navigation commit the
 * skeleton before the hub, so the grid tile and the hero never rendered in
 * one commit and React found no pair to morph; without it, a navigation
 * waits for the hub (prefetched: at once) and commits it whole, and a cold
 * direct visit waits for the render instead of a shell. The guard stays
 * here all the same: the lookup is the same React-cached one
 * `generateMetadata` and the page await (`getLeader` in ./leader.ts), so this
 * adds no statement; the layout returns its children untouched. Not a route:
 * the route table is unchanged. ISR is untouched: the layout reads only
 * `params`.
 */
import { notFound } from "next/navigation";

import { getLeader } from "./leader";

export default async function CommanderHubLayout({ params, children }: LayoutProps<"/c/[slug]">) {
  const { slug } = await params;
  if (!(await getLeader(slug))) notFound();
  return children;
}
