/**
 * The share page's one deck lookup (R6): React `cache` dedupes it across the
 * segment layout (the 404 gate above the loading boundary), generateMetadata
 * and the page within a request — one statement, three readers. Since S6
 * (SECURITY-AUDIT-report.md L4) the viewer's session is read the same way:
 * the layout needs it to answer a real 404 for a private account deck that
 * is not the viewer's, and the page needs it for everything else, so one
 * read serves both. A PRIVATE deck is not a 404 in itself — share-access.ts
 * decides what each viewer gets.
 */
import { headers } from "next/headers";
import { cache } from "react";

import { getSessionUserId } from "@/lib/auth";
import { loadDeckByPublicId } from "@/lib/decks/route-helpers";

export const getDeck = cache(loadDeckByPublicId);

/** The session user id, once per request (null signed out). */
export const getViewer = cache(async () => getSessionUserId(await headers()));
