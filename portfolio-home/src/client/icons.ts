// Inline SVG marks. The page is served under a strict same-origin setup, so there is no icon font
// and no CDN — every mark is drawn here in `currentColor`, so it inherits the colour of whatever it
// sits inside, including on hover.
import type { Contact, Project } from './data.js';

export const ICONS: Record<Contact['icon'], string> = {
  github:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z"/></svg>',
  linkedin:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5ZM.22 8.02h4.56V24H.22Zm8.12 0h4.37v2.18h.06c.61-1.15 2.1-2.36 4.32-2.36 4.62 0 5.47 3.04 5.47 6.99V24h-4.56v-7.28c0-1.74-.03-3.98-2.42-3.98-2.43 0-2.8 1.9-2.8 3.86V24H8.34Z"/></svg>',
  email:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16a2 2 0 0 1 2 2v.35l-10 5.55L2 6.35V6a2 2 0 0 1 2-2Zm-2 4.64V18a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8.64l-9.51 5.28a1 1 0 0 1-.98 0Z"/></svg>',
  resume:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 2.4L17.6 8H14ZM8 9.6h3v1.6H8Zm0 3.4h8v1.6H8Zm0 3.4h8V18H8Z"/></svg>',
};

// Yield sign — an inverted triangle with a bang; stroked so it reads as a road sign rather than a
// solid warning block. Archive box — a lid over a crate. Both inherit their chip's colour.
export const TAG_ICONS: Record<NonNullable<Project['tag']>['icon'], string> = {
  wip:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 21 2.6 4.5h18.8L12 21Z"/><path d="M12 9v3.6" stroke-linecap="round"/>' +
    '<circle cx="12" cy="15.9" r="1.05" fill="currentColor" stroke="none"/></svg>',
  archived:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true">' +
    '<rect x="2.6" y="3.4" width="18.8" height="4.6" rx="1.2"/>' +
    '<path d="M4.4 8v11a1.6 1.6 0 0 0 1.6 1.6h12a1.6 1.6 0 0 0 1.6-1.6V8"/>' +
    '<path d="M9.6 12.2h4.8" stroke-linecap="round"/></svg>',
};

export const STAR_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2.6 2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.44 6.19 20.5l1.1-6.47L2.6 9.45l6.5-.95Z"/></svg>';

// A page in a stack — the mark for "this is product documentation", drawn once and reused by
// every experience FAB.
export const DOC_ICON =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 2.4L17.6 8H14ZM8 11h8v1.7H8Zm0 3.6h8v1.7H8Z"/></svg>';
