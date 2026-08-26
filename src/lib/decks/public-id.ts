/**
 * Short URL slugs for decks (decks.public_id, share pages in P1.7).
 *
 * nanoid-shaped but dependency-free: crypto-random over a 32-char alphabet
 * with lookalikes removed (no 0/o, 1/l/i). 12 chars = 60 bits — collision
 * odds are negligible at any deck count this site will see, and the column's
 * UNIQUE constraint backstops the theoretical case.
 */
import { randomBytes } from "node:crypto";

const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz_";
export const PUBLIC_ID_LENGTH = 12;

export function newPublicId(): string {
  const bytes = randomBytes(PUBLIC_ID_LENGTH);
  let out = "";
  for (let i = 0; i < PUBLIC_ID_LENGTH; i++) {
    out += ALPHABET[bytes[i] % 32];
  }
  return out;
}
