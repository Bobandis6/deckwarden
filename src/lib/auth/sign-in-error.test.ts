/**
 * @vitest-environment node
 *
 * The /account sign-in sentences (S3, SECURITY-AUDIT-report.md M4): an
 * allowlist by code, one generic line for everything else, and never the
 * raw value on the page.
 */
import { describe, expect, it } from "vitest";

import { signInErrorMessage } from "./sign-in-error";

const KNOWN = [
  "email_not_verified",
  "account_not_linked",
  "unable_to_create_user",
  "access_denied",
];
const FALLBACK = "Sign-in didn't finish. Try again.";

describe("signInErrorMessage", () => {
  it("has its own sentence for each code the callback can land with", () => {
    const sentences = KNOWN.map((code) => signInErrorMessage(code));
    for (const sentence of sentences) {
      expect(sentence).toBeTypeOf("string");
      expect(sentence).not.toBe(FALLBACK);
    }
    expect(new Set(sentences).size).toBe(KNOWN.length);
  });

  it("the squat's two codes say what to do", () => {
    expect(signInErrorMessage("email_not_verified")).toMatch(/verif/i);
    expect(signInErrorMessage("account_not_linked")).toMatch(/already exists/i);
  });

  it("any other non-empty code gets the generic line, never the value", () => {
    for (const raw of [
      "state_not_found",
      "invalid_code",
      "<script>alert(1)</script>",
      "constructor",
    ]) {
      const sentence = signInErrorMessage(raw);
      expect(sentence).toBe(FALLBACK);
      expect(sentence).not.toContain(raw);
    }
  });

  it("nothing to show without a code", () => {
    expect(signInErrorMessage(undefined)).toBeNull();
    expect(signInErrorMessage("")).toBeNull();
    expect(signInErrorMessage([])).toBeNull();
  });

  it("a repeated parameter reads its first value", () => {
    expect(signInErrorMessage(["access_denied", "email_not_verified"])).toBe(
      signInErrorMessage("access_denied"),
    );
  });
});
