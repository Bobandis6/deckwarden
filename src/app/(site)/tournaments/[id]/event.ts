/**
 * The event page's one lookup (W10, the /c/[slug]/leader.ts pattern): React
 * `cache` dedupes it across the segment layout (the 404 gate above the
 * loading boundary), generateMetadata and the page within a request. The id
 * regex lives here so every reader shares it — junk ids (non-numeric, or
 * wide enough to overflow int4) answer null without a statement.
 */
import { cache } from "react";

import { loadTournamentEvent } from "@/lib/tournaments/queries";

const ID_RE = /^\d{1,9}$/;

export const getEvent = cache((id: string) =>
  ID_RE.test(id) ? loadTournamentEvent(Number(id)) : Promise.resolve(null),
);
