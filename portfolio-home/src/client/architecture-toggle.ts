// The imperative controller for the architecture panel: the masthead pull-down and the diagram
// slider. Split out from architecture.ts, which now only BUILDS the markup — this is the part that
// wires the built DOM up and owns the runtime state (which slide is live, the viewport height).

/** Wire the pull-down AND the diagram slider. Called by mount(), after the markup exists. */
export function architectureToggle(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-act="architecture"]');
  const mast = document.querySelector<HTMLElement>('.masthead');
  if (!btn || !mast) return;

  const label = btn.querySelector('.arch-pull-t');

  const setOpen = (open: boolean): void => {
    mast.classList.toggle('arch-open', open);
    btn.setAttribute('aria-expanded', String(open));
    if (label) {
      label.textContent = open ? 'Hide the platform architecture' : 'Show me the platform architecture';
    }
    if (open) syncHeight(); // the panel just gained its real height; size the viewport to the live slide
  };

  btn.addEventListener('click', (e) => {
    e.stopPropagation(); // else the document handler below closes it again in the same tick
    setOpen(!mast.classList.contains('arch-open'));
  });

  document.addEventListener('click', (e) => {
    if (mast.classList.contains('arch-open') && !mast.contains(e.target as Node)) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && mast.classList.contains('arch-open')) setOpen(false);
  });

  /* ── The slider ──────────────────────────────────────────────────────────────────────────────
     A transform track, not a scroll container: the two diagrams are different heights, and a
     transform lets the VIEWPORT own the height so it can animate to the active slide instead of
     leaving a lake of whitespace under the shorter one. */
  const tabs = [...mast.querySelectorAll<HTMLButtonElement>('.arch-tab')];
  const track = mast.querySelector<HTMLElement>('.arch-track');
  const viewport = mast.querySelector<HTMLElement>('.arch-viewport');
  const slides = [...mast.querySelectorAll<HTMLElement>('.arch-slide')];
  if (!track || !viewport || !slides.length) return;

  let active = 0;

  const syncHeight = (): void => {
    // Only meaningful once the panel is open and laid out; a closed panel reports height 0.
    if (!mast.classList.contains('arch-open')) return;
    viewport.style.height = `${slides[active].offsetHeight}px`;
  };

  const show = (i: number): void => {
    active = Math.max(0, Math.min(slides.length - 1, i));
    track.style.transform = `translateX(${-active * 100}%)`;
    syncHeight();
    tabs.forEach((t, j) => {
      t.classList.toggle('is-active', j === active);
      t.setAttribute('aria-selected', String(j === active));
    });
  };

  tabs.forEach((t, i) => t.addEventListener('click', () => show(i)));

  // Reflow changes a diagram's height (columns collapse on a phone), so re-measure the live slide.
  let raf = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(syncHeight);
  });

  show(0);
}
