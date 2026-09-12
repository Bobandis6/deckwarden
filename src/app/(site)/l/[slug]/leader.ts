/**
 * The leader hub's one lookup (R6): React `cache` dedupes it across the
 * segment layout (the 404 gate above the loading boundary), generateMetadata
 * and the page within a request — one statement, three readers.
 */
import { cache } from "react";

import { GAME_ID } from "@/db/seed-data";
import { loadLeaderBySlug } from "@/lib/hub/queries";

export const getLeader = cache((slug: string) => loadLeaderBySlug(GAME_ID.optcg, slug));
