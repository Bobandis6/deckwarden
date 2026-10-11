/**
 * The played snapshots' own per-deck allowance (Y9a, WAVE4 §F's default:
 * 100, disclosed). Its own import-free module so the server's check
 * (versions.ts) and the Games dialog's words share one number without the
 * client bundle reaching the database code.
 */
export const MAX_PLAYED_SNAPSHOTS_PER_DECK = 100;
