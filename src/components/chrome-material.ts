/**
 * The chrome material (U3b, WAVE5.md D4; the owner's F8) as one class
 * string for its four sites: the editor header, the sticky search block,
 * the phone tab bar and a stuck group heading. The background at 88 % with
 * a backdrop blur, both read from globals.css (`--chrome`,
 * `--chrome-backdrop`), whose two fallback rules make it the solid strip
 * with no blur for a reader who asked for less transparency or more
 * contrast. A plain module, like site-nav-link.ts, so a server file could
 * share the string; real Tailwind utilities, so tailwind-merge drops the
 * background a primitive brings (the tab list's `bg-transparent`).
 */
export const CHROME_CLASS = "bg-(--chrome) backdrop-filter-(--chrome-backdrop)";
