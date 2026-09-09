/**
 * Vitest setup for component tests (R1a — the first React Testing Library
 * test in the repo, src/components/ui/modal.test.tsx, established the
 * pattern). RTL's automatic cleanup needs a global `afterEach`, which vitest
 * only provides with `globals: true`; registering it here keeps each test's
 * render from leaking into the next.
 */
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});
