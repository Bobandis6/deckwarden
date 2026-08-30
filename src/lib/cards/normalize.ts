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

/**
 * URL slug for hub pages (P2.4), from the FRONT face name only ("Esika, God
 * of the Tree // The Prismatic Bridge" → "esika-god-of-the-tree"). Built on
 * the normalizer above so slug and search agree on deaccenting. Written once
 * by the ingest post-pass and never rewritten — hub URLs must stay stable —
 * so changes here affect only leaders slugged after the change. "" when
 * nothing survives (caller keeps slug NULL).
 */
export function cardSlug(name: string): string {
  return normalizeCardName(name.split(" // ")[0])
    .replace(/'/g, "") // apostrophes vanish: praetors' → praetors, not praetors-
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}
