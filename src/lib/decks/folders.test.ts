import { describe, expect, it } from "vitest";

import { canReadFolder, folderDeckVisibilities, isFolderOwner } from "./folders";

const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "22222222-2222-4222-8222-222222222222";

const folder = (visibility: "public" | "unlisted" | "private") => ({
  userId: OWNER,
  visibility,
});

describe("isFolderOwner", () => {
  it("matches only the owning session", () => {
    expect(isFolderOwner(folder("private"), OWNER)).toBe(true);
    expect(isFolderOwner(folder("private"), STRANGER)).toBe(false);
    expect(isFolderOwner(folder("private"), null)).toBe(false);
  });
});

describe("canReadFolder", () => {
  it("lets anyone read public and unlisted folders", () => {
    for (const v of ["public", "unlisted"] as const) {
      expect(canReadFolder(folder(v), null)).toBe(true);
      expect(canReadFolder(folder(v), STRANGER)).toBe(true);
    }
  });

  it("restricts private folders to the owner", () => {
    expect(canReadFolder(folder("private"), OWNER)).toBe(true);
    expect(canReadFolder(folder("private"), STRANGER)).toBe(false);
    expect(canReadFolder(folder("private"), null)).toBe(false);
  });
});

describe("folderDeckVisibilities (S6, L5)", () => {
  it("shows the owner every deck in any folder", () => {
    for (const v of ["public", "unlisted", "private"] as const) {
      expect(folderDeckVisibilities(folder(v), OWNER)).toEqual(["public", "unlisted", "private"]);
    }
  });

  it("shows strangers only public decks inside a public folder — unlisted means not browsable", () => {
    expect(folderDeckVisibilities(folder("public"), STRANGER)).toEqual(["public"]);
    expect(folderDeckVisibilities(folder("public"), null)).toEqual(["public"]);
  });

  it("shows strangers public and unlisted decks inside an unlisted folder (the link is the secret)", () => {
    expect(folderDeckVisibilities(folder("unlisted"), STRANGER)).toEqual(["public", "unlisted"]);
    expect(folderDeckVisibilities(folder("unlisted"), null)).toEqual(["public", "unlisted"]);
  });

  it("shows strangers nothing inside a private folder", () => {
    expect(folderDeckVisibilities(folder("private"), STRANGER)).toEqual([]);
    expect(folderDeckVisibilities(folder("private"), null)).toEqual([]);
  });
});
