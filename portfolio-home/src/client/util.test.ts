import { describe, expect, test } from 'vitest';
import { esc, fmtDate, slug, tab } from './util.js';

/**
 * The page's string plumbing. Every one of these was unreachable to a test until main.ts was split:
 * they were private to a module that rendered the whole page on import.
 */

describe('esc', () => {
  test('escapes the four characters that break HTML', () => {
    expect(esc('<a href="x">Tom & Jerry</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&lt;/a&gt;',
    );
  });

  test('escapes the ampersand of an already-escaped entity, rather than double-decoding it', () => {
    expect(esc('&amp;')).toBe('&amp;amp;');
  });

  test('leaves ordinary text alone', () => {
    expect(esc("Andres' résumé — 100% fine")).toBe("Andres' résumé — 100% fine");
  });
});

describe('slug', () => {
  test('lowercases and joins on the punctuation', () => {
    expect(slug('open-vMCP')).toBe('open-vmcp');
    expect(slug('RS-Agent-Planning')).toBe('rs-agent-planning');
  });

  test('collapses a run of separators into ONE dash', () => {
    expect(slug('Cloud  Developer -- Quiz')).toBe('cloud-developer-quiz');
  });

  test('never produces a leading or trailing dash', () => {
    // The old implementation created them and then needed a second regex to strip them off.
    expect(slug('  spaced out!  ')).toBe('spaced-out');
    expect(slug('...')).toBe('');
  });
});

describe('fmtDate', () => {
  test('renders a full date', () => {
    expect(fmtDate('2026-07-12')).toBe('Jul 12, 2026');
  });

  test('renders a month-only date without inventing a day', () => {
    expect(fmtDate('2026-07')).toBe('Jul 2026');
  });

  test('drops the leading zero from the day', () => {
    expect(fmtDate('2026-01-05')).toBe('Jan 5, 2026');
  });

  test('survives a month it cannot name', () => {
    expect(fmtDate('2026-13-01')).toBe(' 1, 2026');
  });
});

describe('tab', () => {
  test('an external link opens in a new tab, safely', () => {
    // rel=noopener matters: without it the opened page gets a handle on this one via window.opener.
    expect(tab(true)).toBe(' target="_blank" rel="noopener"');
  });

  test('an internal link does not', () => {
    expect(tab(false)).toBe('');
    expect(tab(undefined)).toBe('');
  });
});
