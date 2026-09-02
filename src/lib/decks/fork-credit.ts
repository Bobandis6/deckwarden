/**
 * The fork credit wire shape (P3.6) — client-safe (no DB imports) so share
 * and editor components can type it; forks.ts resolves it server-side.
 * States are explained in forks.ts.
 */
export type ForkCredit = { state: "linked"; publicId: string; name: string } | { state: "private" };
