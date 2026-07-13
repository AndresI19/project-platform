// The page's string plumbing. Pure, and therefore the only part of the front end that can be tested
// without a DOM at all — which is exactly why it lives in its own module rather than at the top of
// the render file.

// Hoisted, not rebuilt per match. Inline in the replacer, this four-key object was reallocated once
// per escaped CHARACTER — a few hundred throwaway objects on every render.
const ESC_MAP: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

/** Escape text for interpolation into HTML. */
export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ESC_MAP[c]);

/**
 * A DOM-safe key for a project name: "open-vMCP" → "open-vmcp".
 *
 * Split-and-join rather than replace-then-trim. The old version did the substitution and then needed
 * a SECOND regex to undo the leading/trailing dashes the first one had just introduced; splitting on
 * the separator never creates them, so there is nothing to undo.
 */
export const slug = (s: string): string =>
  s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .join('-');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-07-12" → "Jul 12, 2026"; "2026-07" → "Jul 2026". */
export function fmtDate(d: string): string {
  const [y, m, day] = d.split('-');
  const mon = MONTHS[Number(m) - 1] || '';
  return day ? `${mon} ${Number(day)}, ${y}` : `${mon} ${y}`;
}

/** The attributes an off-platform link needs. Built three different ways before this existed. */
export const tab = (external?: boolean): string => (external ? ' target="_blank" rel="noopener"' : '');
