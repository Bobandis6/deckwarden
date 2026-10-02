/**
 * Incremental JSON-array reader for bulk ingest (P2.5).
 *
 * Commander Spellbook's bulk export is ONE giant JSON object
 * (`{"timestamp": …, "version": …, "variants": [ …675MB… ], …}`) — not JSONL — so the
 * readline trick from the Scryfall job doesn't apply and JSON.parse of the
 * whole document would need gigabytes of heap. This walks the byte stream
 * with a string-aware depth counter and yields the elements of one named
 * array in the root object, one parsed element at a time, holding only the
 * current element in memory.
 *
 * The key is matched only where an object key can occur at depth 1 (never
 * inside strings, values, or nested objects), so a decoy value equal to the
 * key name can't hijack the scan. Consumption stops at the array's `]`.
 *
 * `onRootValue` (Y3a) receives the root's scalar values that come before the
 * array — Spellbook's `timestamp` and `version` — from the same single pass;
 * nested root values are skipped unbuffered, and an unparsable scalar is
 * skipped too (the caller records what it got).
 */

type Phase =
  | "seek-key" // scanning the root object for `key`
  | "expect-colon" // key seen; next non-ws must be ':'
  | "expect-array" // colon seen; next non-ws must be '['
  | "in-array" // yielding elements
  | "done";

const WS = /\s/;

export type RootScalar = string | number | boolean | null;

export async function* jsonArrayElements(
  chunks: AsyncIterable<Buffer | Uint8Array | string>,
  key: string,
  onRootValue?: (key: string, value: RootScalar) => void,
): AsyncGenerator<unknown> {
  const decoder = new TextDecoder("utf-8");
  let phase: Phase = "seek-key";

  // Document state.
  let depth = 0; // {}/[] nesting depth from the document root
  let inString = false;
  let escaped = false;
  /** True between a depth-1 ':' and the ',' that ends the pair — i.e. inside a root VALUE. */
  let inRootValue = false;

  // seek-key: the in-progress depth-1 key string, split across chunks.
  let keyBuf: string | null = null;
  let keyStart = -1;

  // in-array: the depth elements live at, and the current element's slices.
  let arrayDepth = -1;
  let parts: string[] | null = null;
  let partStart = -1;

  // seek-key + onRootValue: the last other depth-1 key, and its scalar value's slices.
  let rootKey: string | null = null;
  let valueParts: string[] | null = null;
  let valueStart = -1;
  let valueBegun = false;

  for await (const raw of chunks) {
    const text = typeof raw === "string" ? raw : decoder.decode(raw, { stream: true });
    if (keyBuf !== null) keyStart = 0;
    if (parts !== null) partStart = 0;
    if (valueParts !== null) valueStart = 0;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') {
          inString = false;
          if (keyBuf !== null) {
            const candidate = keyBuf + text.slice(keyStart, i);
            keyBuf = null;
            if (candidate === key) phase = "expect-colon";
            else if (onRootValue) rootKey = candidate;
          }
        }
        continue;
      }

      switch (ch) {
        case '"':
          inString = true;
          if (phase === "seek-key" && depth === 1 && !inRootValue) {
            keyBuf = ""; // an object key position at root depth
            keyStart = i + 1;
          }
          break;
        case "{":
        case "[":
          depth++;
          break;
        case "}":
        case "]":
          depth--;
          break;
        case ":":
          if (depth === 1) {
            inRootValue = true;
            if (phase === "seek-key" && rootKey !== null) {
              valueParts = [];
              valueStart = i + 1;
              valueBegun = false;
            }
          }
          break;
        case ",":
          if (depth === 1) inRootValue = false;
          break;
      }

      // i >= valueStart: never the pair's own ':' (the value starts after it).
      if (valueParts !== null && rootKey !== null && i >= valueStart) {
        if (!valueBegun && !WS.test(ch)) {
          valueBegun = true;
          // An object or array: not a scalar — skip it without buffering.
          if (ch === "{" || ch === "[") valueParts = null;
        } else if ((ch === "," && depth === 1) || (ch === "}" && depth === 0)) {
          const valueText = valueParts.join("") + text.slice(valueStart, i);
          let value: unknown;
          try {
            value = JSON.parse(valueText);
          } catch {
            value = undefined;
          }
          if (value === null || ["string", "number", "boolean"].includes(typeof value)) {
            onRootValue!(rootKey, value as RootScalar);
          }
          valueParts = null;
        }
        if (valueParts === null) rootKey = null;
      }

      if (phase === "expect-colon") {
        if (ch === ":") phase = "expect-array";
        else if (!WS.test(ch)) throw new Error(`expected ':' after "${key}", got '${ch}'`);
      } else if (phase === "expect-array") {
        if (ch === "[") {
          phase = "in-array";
          arrayDepth = depth; // the switch already counted this '['
        } else if (!WS.test(ch)) {
          throw new Error(`"${key}" is not an array (got '${ch}')`);
        }
      } else if (phase === "in-array") {
        if (parts === null) {
          // Between elements: the array may close, or an element begins at
          // the first char that isn't whitespace or the ',' separator.
          if (ch === "]" && depth === arrayDepth - 1) {
            phase = "done";
            return;
          }
          if (ch !== "," && !WS.test(ch)) {
            parts = [];
            partStart = i;
          }
        } else if (!inString && depth < arrayDepth) {
          // The array's own ']' — finish the final element and stop.
          parts.push(text.slice(partStart, i));
          yield JSON.parse(parts.join(""));
          phase = "done";
          return;
        } else if (!inString && ch === "," && depth === arrayDepth) {
          parts.push(text.slice(partStart, i));
          yield JSON.parse(parts.join(""));
          parts = null;
        }
      }
    }

    // Chunk boundary: bank the in-progress slices.
    if (keyBuf !== null) keyBuf += text.slice(keyStart);
    if (parts !== null) parts.push(text.slice(partStart));
    if (valueParts !== null) valueParts.push(text.slice(valueStart));
  }

  // Reaching stream end is always a failure: every success path returns from
  // inside the loop when the array's ']' arrives.
  throw new Error(
    phase === "in-array"
      ? `stream ended inside the "${key}" array`
      : `key "${key}" not found as a top-level array`,
  );
}
