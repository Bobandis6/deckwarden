/**
 * THE name-normalization function (working agreement: exactly one, shared by
 * ingest, search, and decklist-import parsing). Feeds `card_identities.name_norm`,
 * which backs the pg_trgm autocomplete index — so any change here requires a
 * re-ingest to keep stored values consistent with query-side normalization.
 */
export function normalizeCardName(name: string): string {
  return (
    name
      .normalize("NFKD")
      // strip combining marks left by NFKD (é → e, û → u)
      .replace(/\p{M}/gu, "")
      // ligatures NFKD leaves alone
      .replace(/Æ/g, "AE")
      .replace(/æ/g, "ae")
      .replace(/Œ/g, "OE")
      .replace(/œ/g, "oe")
      .toLowerCase()
      // curly/backtick apostrophes → straight
      .replace(/[’‘´`]/g, "'")
      // fold double-faced separators: "fire // ice" matches "fire ice"
      .replace(/\s*\/\/\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}
