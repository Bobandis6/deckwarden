/**
 * The anonymous-deck purge's report (S1, SECURITY-AUDIT-report.md M2): what
 * `scripts/purge-anon-decks.ts` prints. The nightly runs it in a PUBLIC
 * repository, so its log is world-readable for the retention window — and
 * until S1 it printed every candidate's internal id, public id and name,
 * private guest decks included (an unlisted public id in a public log is
 * not unlisted). The report is counts per reason; the per-deck lines exist
 * only behind PURGE_VERBOSE=1, which the workflow never sets.
 *
 * Pure: the script reads the rows and prints these lines.
 */

export type PurgeReason = "empty" | "untouched";

export interface PurgeCandidate {
  id: string;
  publicId: string;
  name: string;
  cardRows: number;
  createdAt: Date;
  updatedAt: Date;
  reason: PurgeReason;
}

export interface PurgeSummary {
  candidates: number;
  empty: number;
  untouched: number;
}

export interface PurgeReportOptions {
  /** PURGE_APPLY=true: the candidates are deleted after the report. */
  apply: boolean;
  /** PURGE_VERBOSE=1: one line per candidate (ids and names) — local runs only. */
  verbose: boolean;
  /** The two windows, as the SQL interval text ("30 days", "12 months"). */
  emptyAfter: string;
  untouchedAfter: string;
}

export function summarizePurge(candidates: readonly PurgeCandidate[]): PurgeSummary {
  let empty = 0;
  let untouched = 0;
  for (const c of candidates) {
    if (c.reason === "untouched") untouched += 1;
    else empty += 1;
  }
  return { candidates: candidates.length, empty, untouched };
}

/** The per-deck line: the pre-S1 format, verbose runs only. */
export function purgeCandidateLine(c: PurgeCandidate, opts: PurgeReportOptions): string {
  const reason =
    c.reason === "untouched" ? `untouched > ${opts.untouchedAfter}` : `empty > ${opts.emptyAfter}`;
  return `  ${c.id}  ${c.publicId}  "${c.name}"  cards=${c.cardRows}  created=${c.createdAt.toISOString()}  updated=${c.updatedAt.toISOString()}  (${reason})`;
}

/**
 * The lines the script prints before it acts: counts per reason and the
 * number it would delete (or will, under PURGE_APPLY). No id, public id or
 * name unless `verbose`.
 */
export function purgeReportLines(
  candidates: readonly PurgeCandidate[],
  opts: PurgeReportOptions,
): string[] {
  const s = summarizePurge(candidates);
  const lines = [
    `purge-anon-decks: ${s.candidates} candidate(s) — mode: ${opts.apply ? "APPLY" : "dry-run"}`,
    `  empty > ${opts.emptyAfter}: ${s.empty}`,
    `  untouched > ${opts.untouchedAfter}: ${s.untouched}`,
    `  ${opts.apply ? "deleting" : "would delete"}: ${s.candidates}`,
  ];
  if (s.candidates === 0) return lines;
  if (opts.verbose) {
    for (const c of candidates) lines.push(purgeCandidateLine(c, opts));
  } else {
    lines.push(
      "  per-deck lines (ids, names) print only with PURGE_VERBOSE=1 — never in Actions, whose logs are public.",
    );
  }
  return lines;
}
