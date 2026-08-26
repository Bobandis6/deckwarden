/**
 * Renders an adapter's `display.costHtml` string (mana pips / DON!! / IKZ).
 * The HTML comes from the adapter's pure display code (span.pip markup,
 * escaped there); .pip styling lives in globals.css.
 */
export function CostPips({ html, className }: { html: string; className?: string }) {
  if (!html) return null;
  return (
    <span
      className={`whitespace-nowrap ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
