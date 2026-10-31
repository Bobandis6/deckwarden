/**
 * Whether text typed on a third-party site can go any further (the
 * 2026-10-30 security audit's feed record). Organizers and players type the
 * event and player names Topdeck and Limitless serve, and two characters
 * survive `trim()` and a length check only to fail the whole nightly run:
 * U+0000 (as the `\u0000` JSON escape) is refused by Postgres when it is
 * bound (SQLSTATE 22021), and a lone surrogate makes `encodeURIComponent`
 * throw. Either one fails the run before anything merges, and because the
 * watermark reads succeeded runs only, the same event came back every night
 * until it aged out of the 180-day window. Neither feed has ever carried
 * one (2,917 archived Topdeck events through 2026-08-22), and whether they
 * could isn't ours to know, so the mappers refuse the text instead of asking.
 */
export function isStorableText(text: string): boolean {
  return !text.includes("\u0000") && text.isWellFormed();
}
