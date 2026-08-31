/**
 * The type-to-confirm phrase for account deletion (P2.8) — typed by the user
 * in the danger-zone dialog and restated verbatim in the DELETE /api/account
 * body. Its own module (no DB imports) so the client component can share it
 * with the server route without dragging the postgres driver into the bundle.
 */
export const DELETE_CONFIRM_PHRASE = "delete my account";
