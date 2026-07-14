import { vi } from 'vitest';

/**
 * A real localStorage. happy-dom 15 ships a `localStorage` object with no `clear()`, and the
 * greeting dialog's "ask once" rule is entirely localStorage-based — so the tests need a complete,
 * resettable Storage rather than a partial one.
 */
class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(String(k), String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
  [name: string]: unknown;
}

const storage = new MemoryStorage();
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });

// happy-dom has no <dialog> implementation: showModal/close are simply absent, and greet() calls
// both. Give the element the two methods plus the `open` flag the spec says they toggle, so the
// dialog can actually be exercised.
const proto = window.HTMLDialogElement?.prototype as (HTMLDialogElement & { showModal?: unknown }) | undefined;
if (proto && typeof proto.showModal !== 'function') {
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  proto.close = function (this: HTMLDialogElement, returnValue?: string) {
    this.removeAttribute('open');
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.dispatchEvent(new Event('close'));
  };
}
