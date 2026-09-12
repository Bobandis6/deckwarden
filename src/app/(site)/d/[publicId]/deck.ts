/**
 * The share page's one deck lookup (R6): React `cache` dedupes it across the
 * segment layout (the 404 gate above the loading boundary), generateMetadata
 * and the page within a request — one statement, three readers. A PRIVATE
 * deck is not a 404: the page hands it to the client gate as before.
 */
import { cache } from "react";

import { loadDeckByPublicId } from "@/lib/decks/route-helpers";

export const getDeck = cache(loadDeckByPublicId);
