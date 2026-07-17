// The imperative controller for the architecture panel: the masthead pull-down and the diagram
// slider. Split out from architecture.ts, which now only BUILDS the markup — this is the part that
// wires the built DOM up and owns the runtime state (which slide is live, the viewport height).

/** Wire the pull-down AND the diagram slider. Called by mount(), after the markup exists. */
export function architectureToggle(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-act="architecture"]');
  const mast = document.querySelector<HTMLElement>('.masthead');
  if (!btn || !mast) return;

  const label = btn.querySelector('.arch-pull-t');

  /* ── The slider ──────────────────────────────────────────────────────────────────────────────
     A transform track, not a scroll container: the diagrams are different heights, and a transform
     lets the VIEWPORT own the height so it can animate to the active slide instead of leaving a lake
     of whitespace under the shorter one.

     Queried BEFORE setOpen is defined, and syncHeight tolerates their absence rather than the function
     returning early. It used to read the other way round: an early `return` sat between the pull-down's
     click listener and the `const syncHeight` that listener closes over — so markup without a slider
     left setOpen holding a reference to a const that was never initialised, and the first click threw
     ReferenceError. A no-op is the honest degradation; a temporal dead zone is not. */
  const tabs = [...mast.querySelectorAll<HTMLButtonElement>('.arch-tab')];
  const track = mast.querySelector<HTMLElement>('.arch-track');
  const viewport = mast.querySelector<HTMLElement>('.arch-viewport');
  const slides = [...mast.querySelectorAll<HTMLElement>('.arch-slide')];

  let active = 0;

  const syncHeight = (): void => {
    // Only meaningful once the panel is open and laid out; a closed panel reports height 0.
    if (!viewport || !slides.length || !mast.classList.contains('arch-open')) return;
    viewport.style.height = `${slides[active].offsetHeight}px`;
  };

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

  if (!track || !viewport || !slides.length) return;

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

  let raf = 0;
  const resync = (): void => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(syncHeight);
  };

  /* WIDTH, not `resize`. Two different things used to be conflated here.
     `resize` fires on iOS every time the URL bar collapses or reveals on scroll — a HEIGHT change,
     which cannot alter a diagram's layout. The viewport has `transition: height .4s`, so each one
     kicked off a 400ms animation, and scrolling the page animated the panel continuously. The only
     thing that can reflow a diagram is a WIDTH change, so that is what is watched. */
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    resync();
  });

  /* And `resize` is not enough on its own: it says the WINDOW changed, not that this slide did. A late
     web font, or an image settling, re-lays the diagram out with no window event at all — leaving the
     viewport pinned to a stale height with `overflow:hidden` quietly clipping the bottom of the slide.
     Observing the element asks the real question: did THIS box change size? */
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(resync);
    for (const s of slides) ro.observe(s);
  }

  show(0);
}
