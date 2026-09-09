/**
 * The search pane's state machine (R3, REDESIGN.md §2 "Search" / C5): a pure
 * reducer over idle · typing · searching · results · empty · failed, so the
 * two bugs the redesign named cannot come back — "No cards match" rendering
 * while the request is still in flight (it renders only in `empty`, a
 * verdict a RESPONSE delivers) and a status line that never cleared (the
 * `notice` clears on the next input). The component (search-pane.tsx) owns
 * the 200 ms debounce and the fetch; every response carries the `requestId`
 * it was sent under, and a stale one never wins.
 *
 * Successful adds are the toast's (F3); the pane's live line carries only
 * rejections, so nothing announces twice.
 */
import { parseQuickAdd, type EditorCard } from "@/lib/decks/editor-state";

export type SearchStatus = "idle" | "typing" | "searching" | "results" | "empty" | "failed";

export interface SearchNotice {
  text: string;
  tone: "ok" | "err";
}

export interface SearchState {
  status: SearchStatus;
  /** The raw input, quantity prefix included. */
  raw: string;
  /** parseQuickAdd(raw): the query a request carries and the quantity an add uses. */
  query: string;
  qty: number;
  results: EditorCard[];
  sel: number;
  /** The pane's live line (rejected adds). Cleared by the next input. */
  notice: SearchNotice | null;
  /** The token the next request carries; a response with any other token is dropped. */
  requestId: number;
}

export type SearchAction =
  | { type: "input"; raw: string }
  | { type: "request" }
  | { type: "response"; id: number; results: EditorCard[] }
  | { type: "failure"; id: number }
  | { type: "move"; delta: number }
  | { type: "select"; index: number }
  | { type: "notice"; notice: SearchNotice | null }
  | { type: "added" }
  | { type: "retry" }
  | { type: "clear" };

export const INITIAL_SEARCH_STATE: SearchState = {
  status: "idle",
  raw: "",
  query: "",
  qty: 1,
  results: [],
  sel: 0,
  notice: null,
  requestId: 0,
};

export function searchReducer(state: SearchState, action: SearchAction): SearchState {
  switch (action.type) {
    case "input": {
      const { qty, query } = parseQuickAdd(action.raw);
      if (!query) {
        return {
          ...state,
          status: "idle",
          raw: action.raw,
          query: "",
          qty,
          results: [],
          sel: 0,
          notice: null,
          requestId: state.requestId + 1,
        };
      }
      if (query === state.query) {
        // Only the quantity prefix moved ("4 Sol Ring" → "5 Sol Ring"): no new request.
        return { ...state, raw: action.raw, qty, notice: null };
      }
      // A new query: the last results stay on screen until the response lands
      // (no flicker), but the old query's verdict (empty / failed) does not.
      return {
        ...state,
        status: "typing",
        raw: action.raw,
        query,
        qty,
        notice: null,
        requestId: state.requestId + 1,
      };
    }
    case "request":
      return state.query ? { ...state, status: "searching" } : state;
    case "response":
      if (action.id !== state.requestId) return state;
      return {
        ...state,
        status: action.results.length > 0 ? "results" : "empty",
        results: action.results,
        sel: 0,
      };
    case "failure":
      if (action.id !== state.requestId) return state;
      return { ...state, status: "failed", results: [], sel: 0 };
    case "move": {
      const n = state.results.length;
      if (n === 0) return state;
      return { ...state, sel: (state.sel + action.delta + n) % n };
    }
    case "select":
      if (action.index < 0 || action.index >= state.results.length) return state;
      return { ...state, sel: action.index };
    case "notice":
      return { ...state, notice: action.notice };
    case "retry":
      if (state.status !== "failed") return state;
      return { ...state, status: "typing", requestId: state.requestId + 1 };
    case "added":
    case "clear":
      return {
        ...INITIAL_SEARCH_STATE,
        notice: action.type === "added" ? null : state.notice,
        requestId: state.requestId + 1,
      };
  }
}
