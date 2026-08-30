import { describe, expect, it } from "vitest";

import { jsonArrayElements } from "./json-array-stream";

/** Feed `doc` in fixed-size chunks — boundary bugs shake out at size 1..3. */
async function* chunked(doc: string, size: number): AsyncGenerator<string> {
  for (let i = 0; i < doc.length; i += size) yield doc.slice(i, i + size);
}

async function collect(doc: string, key: string, size: number): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const el of jsonArrayElements(chunked(doc, size), key)) out.push(el);
  return out;
}

/** Every chunking of the same doc must parse identically. */
async function collectAllSizes(doc: string, key: string): Promise<unknown[]> {
  const sizes = [1, 2, 3, 7, doc.length];
  const runs = await Promise.all(sizes.map((s) => collect(doc, key, s)));
  for (const run of runs.slice(1)) expect(run).toEqual(runs[0]);
  return runs[0];
}

describe("jsonArrayElements", () => {
  it("yields each element of the named array", async () => {
    const doc = `{"timestamp": "t", "variants": [{"id": 1}, {"id": 2}, {"id": 3}]}`;
    expect(await collectAllSizes(doc, "variants")).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  });

  it("handles an empty array", async () => {
    expect(await collectAllSizes(`{"variants": []}`, "variants")).toEqual([]);
    expect(await collectAllSizes(`{"variants": [  ]}`, "variants")).toEqual([]);
  });

  it("handles nested objects, arrays, and gnarly strings inside elements", async () => {
    const el = {
      id: "a-1",
      uses: [{ card: { name: 'Fable // "Kiki"', text: "Add {C}, [T]: }]" } }],
      deep: { a: [1, [2, { b: "]}" }]] },
    };
    const doc = `{"variants":[${JSON.stringify(el)},${JSON.stringify(el)}]}`;
    expect(await collectAllSizes(doc, "variants")).toEqual([el, el]);
  });

  it("survives escaped quotes and backslashes at chunk boundaries", async () => {
    const el = { s: 'he said \\"hi\\" \\\\ done', t: "tab\\ttext" };
    const doc = `{"variants":[${JSON.stringify(el)}]}`;
    expect(await collectAllSizes(doc, "variants")).toEqual([el]);
  });

  it("survives multi-byte UTF-8 split across chunks (byte input)", async () => {
    const el = { name: "Jötun Owl Keeper — 世界を割る者" };
    const doc = `{"variants":[${JSON.stringify(el)}]}`;
    const bytes = Buffer.from(doc, "utf8");
    for (const size of [1, 2, 3, 5]) {
      const out: unknown[] = [];
      const gen = (async function* () {
        for (let i = 0; i < bytes.length; i += size) yield bytes.subarray(i, i + size);
      })();
      for await (const e of jsonArrayElements(gen, "variants")) out.push(e);
      expect(out).toEqual([el]);
    }
  });

  it("is not fooled by the key appearing as a value or in nested objects", async () => {
    const doc = `{
      "decoy": "variants",
      "nested": {"variants": [{"id": "wrong"}]},
      "variants": [{"id": "right"}]
    }`;
    expect(await collectAllSizes(doc, "variants")).toEqual([{ id: "right" }]);
  });

  it("handles scalar elements and stray whitespace", async () => {
    const doc = `{ "variants" : [ 1 , "two" , null , true , [3] ] }`;
    expect(await collectAllSizes(doc, "variants")).toEqual([1, "two", null, true, [3]]);
  });

  it("stops consuming at the array's close (trailing keys ignored)", async () => {
    const doc = `{"variants":[{"id":1}],"after":{"variants":"not an array"}}`;
    expect(await collectAllSizes(doc, "variants")).toEqual([{ id: 1 }]);
  });

  it("throws when the key is missing", async () => {
    await expect(collect(`{"other":[1]}`, "variants", 3)).rejects.toThrow(/not found/);
  });

  it("throws when the key maps to a non-array", async () => {
    await expect(collect(`{"variants":{"a":1}}`, "variants", 3)).rejects.toThrow(/not an array/);
  });

  it("throws when the stream ends mid-array", async () => {
    await expect(collect(`{"variants":[{"id":1}`, "variants", 3)).rejects.toThrow(/ended inside/);
  });
});
