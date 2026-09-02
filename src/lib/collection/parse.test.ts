/**
 * Real header rows, captured 2026-09-02 from live exports (the MtgCsvHelper
 * repo's real-export fixtures — manabox-real-export.csv / moxfield-real-
 * export.csv — its issue tracker, and a tappedout thread quoting a ManaBox
 * export). Not paraphrased: if ManaBox or Moxfield rename a column, this
 * suite is what should go red.
 */
import { describe, expect, it } from "vitest";

import {
  detectCollectionFormat,
  formatRejects,
  normalizeFinish,
  parseCollectionCsv,
  parseCsv,
} from "./parse";
import { COLLECTION_LIMITS } from "./types";

const MANABOX_HEADER =
  "Name,Set code,Set name,Collector number,Foil,Rarity,Quantity,ManaBox ID,Scryfall ID,Purchase price,Misprint,Altered,Condition,Language,Purchase price currency";

/** Newer ManaBox exports prepend the binder columns (manabox-field-fidelity.csv). */
const MANABOX_BINDER_HEADER = "Binder Name,Binder Type," + MANABOX_HEADER;

/** Real ManaBox lines: quoted name with a comma, DFC name, "normal"/"foil", uppercase set codes. */
const MANABOX_ROWS = [
  `"Aragorn, the Uniter",LTR,The Lord of the Rings: Tales of Middle-earth,741z,foil,mythic,1,89216,9d481911-48a9-4cd7-a3b4-14c058dcac19,4599.99,false,false,near_mint,en,USD`,
  `"Aragorn, the Uniter",LTR,The Lord of the Rings: Tales of Middle-earth,192,normal,mythic,1,83611,e98d5321-ec09-456c-a9ea-c8ca2cfc6205,12.0,false,false,near_mint,en,USD`,
  `Brazen Borrower // Petty Theft,ELD,Throne of Eldraine,39,normal,mythic,1,46299,c2089ec9-0665-448f-bfe9-d181de127814,1.5,false,false,near_mint,en,USD`,
  `Dawn of a New Age,LTR,The Lord of the Rings: Tales of Middle-earth,5,normal,mythic,1,83505,cb966ee6-bf1b-4bb6-9277-8de6f3918ae2,1.84,false,false,near_mint,ja,USD`,
];

const MOXFIELD_HEADER = `"Count","Tradelist Count","Name","Edition","Condition","Language","Foil","Tags","Last Modified","Collector Number","Alter","Proxy","Purchase Price"`;

/** Real Moxfield lines: every field quoted, lowercase Edition, ""/"foil", Proxy flag. */
const MOXFIELD_ROWS = [
  `"1","1","Aragorn, the Uniter","ltr","Near Mint","English","foil","","2026-05-15 13:52:30.943000","741z","False","False",""`,
  `"1","1","Aragorn, the Uniter","ltr","Near Mint","English","","","2026-05-15 13:51:43.373000","192","False","False","12.00"`,
  `"2","1","Brazen Borrower // Petty Theft","eld","Near Mint","English","","","2026-05-15 13:51:43.373000","39","False","False","1.50"`,
  `"1","1","Aarakocra Sneak","clb","Near Mint","Korean","","","2025-06-27 06:59:41.710000","54","False","False",""`,
];

describe("parseCsv", () => {
  it("handles quotes, doubled quotes, embedded newlines, CRLF/CR/LF and a BOM", () => {
    const text = '﻿a,b,c\r\n"x, y","he said ""hi""","multi\nline"\rlast,,\n';
    expect(parseCsv(text)).toEqual([
      ["a", "b", "c"],
      ["x, y", 'he said "hi"', "multi\nline"],
      ["last", "", ""],
    ]);
  });

  it("keeps a final record without a trailing newline", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("detectCollectionFormat", () => {
  it("recognizes the real ManaBox header in any column order and case", () => {
    expect(detectCollectionFormat(MANABOX_HEADER.split(","))).toBe("manabox");
    expect(detectCollectionFormat(MANABOX_BINDER_HEADER.split(","))).toBe("manabox");
    expect(detectCollectionFormat(MANABOX_HEADER.split(",").reverse())).toBe("manabox");
    expect(detectCollectionFormat(MANABOX_HEADER.toUpperCase().split(","))).toBe("manabox");
  });

  it("recognizes the real Moxfield header, quoted or bare, full or reduced", () => {
    expect(detectCollectionFormat(parseCsv(MOXFIELD_HEADER)[0])).toBe("moxfield");
    expect(
      detectCollectionFormat(
        "Count,Tradelist Count,Name,Edition,Condition,Language,Foil,Tags,Last Modified,Collector Number,Alter,Proxy,Purchase Price".split(
          ",",
        ),
      ),
    ).toBe("moxfield");
    // moxfield-blank-and-delimiter-rows.csv: a re-export with dropped columns.
    expect(
      detectCollectionFormat(
        "Count,Name,Edition,Collector Number,Foil,Condition,Language,Purchase Price".split(","),
      ),
    ).toBe("moxfield");
  });

  it("claims nothing for other apps' exports (Deckbox-shaped header)", () => {
    expect(
      detectCollectionFormat(
        "Folder Name,Quantity,Trade Quantity,Card Name,Set Code,Set Name,Card Number,Condition,Printing,Language,Price Bought,Date Bought,LOW,MID,MARKET".split(
          ",",
        ),
      ),
    ).toBeNull();
  });
});

describe("normalizeFinish", () => {
  it("maps both apps' vocabularies and flags the unknown", () => {
    expect(normalizeFinish("normal")).toEqual({ finish: "nonfoil", known: true });
    expect(normalizeFinish("")).toEqual({ finish: "nonfoil", known: true });
    expect(normalizeFinish("foil")).toEqual({ finish: "foil", known: true });
    expect(normalizeFinish("Etched")).toEqual({ finish: "etched", known: true });
    expect(normalizeFinish("yes")).toEqual({ finish: "foil", known: true });
    expect(normalizeFinish("bogus")).toEqual({ finish: "nonfoil", known: false });
  });
});

describe("parseCollectionCsv — ManaBox", () => {
  it("parses real rows: Scryfall id, lowercased set code, collector number, finish, quantity, language", () => {
    const out = parseCollectionCsv([MANABOX_HEADER, ...MANABOX_ROWS].join("\r\n") + "\r\n");
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.format).toBe("manabox");
    expect(out.result.rejects).toEqual([]);
    expect(out.result.rows).toHaveLength(4);
    expect(out.result.rows[0]).toEqual({
      line: 2,
      name: "Aragorn, the Uniter",
      scryfallId: "9d481911-48a9-4cd7-a3b4-14c058dcac19",
      setCode: "ltr",
      collectorNumber: "741z",
      language: "en",
      finish: "foil",
      quantity: 1,
    });
    expect(out.result.rows[2].name).toBe("Brazen Borrower // Petty Theft");
    expect(out.result.rows[2].finish).toBe("nonfoil");
    // A Japanese row keeps the English printing's Scryfall id (that's what ManaBox writes).
    expect(out.result.rows[3]).toMatchObject({
      scryfallId: "cb966ee6-bf1b-4bb6-9277-8de6f3918ae2",
      language: "ja",
    });
  });

  it("tolerates the binder columns, a BOM, extra columns and shuffled column order", () => {
    const header = "﻿" + MANABOX_BINDER_HEADER + ",Extra";
    const row = `my list,list,"Millicent, Restless Revenant",VOC,Crimson Vow Commander,1,normal,mythic,1,64142,2b86b538-0766-440d-a2cd-f5d5bfcfb010,0.47,false,false,near_mint,de,USD,zzz`;
    const out = parseCollectionCsv(`${header}\n${row}\n`);
    expect(out.ok && out.result.rows[0]).toMatchObject({
      name: "Millicent, Restless Revenant",
      scryfallId: "2b86b538-0766-440d-a2cd-f5d5bfcfb010",
      setCode: "voc",
      collectorNumber: "1",
      quantity: 1,
    });

    const shuffled = parseCollectionCsv(
      [
        "Quantity,Scryfall ID,Foil,Name",
        "3,e98d5321-ec09-456c-a9ea-c8ca2cfc6205,etched,Aragorn",
      ].join("\n"),
    );
    expect(shuffled.ok && shuffled.result.rows[0]).toMatchObject({
      quantity: 3,
      finish: "etched",
      scryfallId: "e98d5321-ec09-456c-a9ea-c8ca2cfc6205",
      name: "Aragorn",
    });
  });

  it("rejects broken lines with line numbers and reasons, never silently", () => {
    const text = [
      MANABOX_HEADER,
      `,LTR,The Lord of the Rings,192,normal,mythic,1,83611,e98d5321-ec09-456c-a9ea-c8ca2cfc6205,,,,,en,USD`,
      `Sol Ring,C21,Commander 2021,1,normal,uncommon,zero,,,,,,,en,USD`,
      `Sol Ring,C21,Commander 2021,1,normal,uncommon,0,,,,,,,en,USD`,
      `Sol Ring,C21`,
      `Sol Ring,C21,Commander 2021,1,glossy,uncommon,2,,not-a-uuid,,,,,en,USD`,
    ].join("\n");
    const out = parseCollectionCsv(text);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rejects.map((r) => [r.line, r.reason])).toEqual([
      [2, "no-name"],
      [3, "bad-quantity"],
      [4, "bad-quantity"],
      [5, "too-few-columns"],
    ]);
    // The glossy row survives: unknown finish → nonfoil, counted; bad id → no id, still resolvable by set/number.
    expect(out.result.rows).toHaveLength(1);
    expect(out.result.rows[0]).toMatchObject({
      finish: "nonfoil",
      setCode: "c21",
      collectorNumber: "1",
    });
    expect(out.result.rows[0].scryfallId).toBeUndefined();
    expect(out.result.unknownFinishes).toEqual({ count: 1, examples: ["glossy"] });
    expect(out.result.lineCount).toBe(5);
    expect(formatRejects(out.result.rejects).split("\n")[0]).toMatch(/^line 2 — no card name: /);
  });

  it("clamps absurd quantities and counts it", () => {
    const out = parseCollectionCsv(
      [MANABOX_HEADER, `Forest,LTR,LotR,300,normal,common,123456,,,,,,,en,USD`].join("\n"),
    );
    expect(out.ok && out.result.rows[0].quantity).toBe(COLLECTION_LIMITS.maxQuantity);
    expect(out.ok && out.result.quantityClamped).toBe(1);
  });
});

describe("parseCollectionCsv — Moxfield", () => {
  it("parses real quoted rows: Count, lowercase Edition, Collector Number, blank Foil = nonfoil", () => {
    const out = parseCollectionCsv([MOXFIELD_HEADER, ...MOXFIELD_ROWS].join("\r\n"));
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.format).toBe("moxfield");
    expect(out.result.rejects).toEqual([]);
    expect(out.result.rows).toHaveLength(4);
    expect(out.result.rows[0]).toEqual({
      line: 2,
      name: "Aragorn, the Uniter",
      setCode: "ltr",
      collectorNumber: "741z",
      language: "English",
      finish: "foil",
      quantity: 1,
    });
    expect(out.result.rows[2]).toMatchObject({ quantity: 2, finish: "nonfoil", setCode: "eld" });
    expect(out.result.rows.every((r) => r.scryfallId === undefined)).toBe(true);
  });

  it("skips Proxy=True lines (not owned) and blank / delimiter-only lines, disclosing counts", () => {
    const text = [
      "Count,Name,Edition,Collector Number,Foil,Condition,Language,Purchase Price,Proxy",
      "2,Lightning Bolt,M11,149,,Near Mint,English,,False",
      "",
      ",,,,,,,,",
      "1,Counterspell,MH2,267,,Near Mint,English,,True",
      "1,Sol Ring,C21,1,foil,Near Mint,English,,",
      "",
    ].join("\n");
    const out = parseCollectionCsv(text);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.rows.map((r) => r.name)).toEqual(["Lightning Bolt", "Sol Ring"]);
    expect(out.result.rows[0]).toMatchObject({
      setCode: "m11",
      collectorNumber: "149",
      quantity: 2,
    });
    expect(out.result.proxiesSkipped).toBe(1);
    expect(out.result.blankLines).toBe(2);
    expect(out.result.lineCount).toBe(3);
  });

  it("treats the community's rejected finish spellings tolerantly (yes/true → foil; bogus → nonfoil, counted)", () => {
    const text = [
      MOXFIELD_HEADER,
      `"1","1","Lightning Bolt","m11","Near Mint","English","yes","","","149","","",""`,
      `"1","1","Lightning Bolt","m11","Near Mint","English","true","","","149","","",""`,
      `"1","1","Lightning Bolt","m11","Near Mint","English","bogus","","","149","","",""`,
    ].join("\n");
    const out = parseCollectionCsv(text);
    expect(out.ok && out.result.rows.map((r) => r.finish)).toEqual(["foil", "foil", "nonfoil"]);
    expect(out.ok && out.result.unknownFinishes.count).toBe(1);
  });
});

describe("parseCollectionCsv — refusals", () => {
  it("names the problem for an empty file and for a foreign header", () => {
    expect(parseCollectionCsv("")).toMatchObject({ ok: false, error: "The file is empty." });
    const foreign = parseCollectionCsv("Folder Name,Quantity,Card Name,Set Code\nx,1,Sol Ring,C21");
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.error).toMatch(/ManaBox or Moxfield/);
    expect(foreign.header).toEqual(["Folder Name", "Quantity", "Card Name", "Set Code"]);
  });

  it("refuses a recognized format that lost its required column", () => {
    const out = parseCollectionCsv("Scryfall ID,Quantity\nabc,1");
    expect(out).toMatchObject({ ok: false, error: 'The header has no "Name" column.' });
  });
});
