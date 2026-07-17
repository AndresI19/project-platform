// The imperative controller for the architecture panel: the masthead pull-down and diagram slider.
// Split from architecture.ts (which only BUILDS the markup) — this wires the DOM up and owns the
// runtime state (which slide is live, the viewport height).

/** Wire the pull-down AND the diagram slider. Called by mount(), after the markup exists. */
export function architectureToggle(): void {
  const btn = document.querySelector<HTMLButtonElement>('[data-act="architecture"]');
  const mast = document.querySelector<HTMLElement>('.masthead');
  if (!btn || !mast) return;

  const label = btn.querySelector('.arch-pull-t');

  /* The slider. A transform track, not a scroll container: the diagrams are different heights, and a
     transform lets the VIEWPORT own the height so it animates to the active slide instead of leaving
     whitespace under a shorter one. Queried BEFORE setOpen, and syncHeight tolerates their absence
     rather than returning early: an early `return` between the click listener and the `const syncHeight`
     it closes over left setOpen referencing an uninitialised const, so the first click threw
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

  /* WIDTH, not `resize`. `resize` fires on iOS every time the URL bar collapses on scroll — a HEIGHT
     change that can't alter layout — and the viewport's `transition: height .4s` turned each into a
     400ms animation, so scrolling animated the panel continuously. Only a WIDTH change reflows a
     diagram, so that's what's watched. */
  let lastWidth = window.innerWidth;
  window.addEventListener('resize', () => {
    if (window.innerWidth === lastWidth) return;
    lastWidth = window.innerWidth;
    resync();
  });

  /* And `resize` alone isn't enough: it says the WINDOW changed, not this slide. A late web font or a
     settling image re-lays the diagram out with no window event, pinning the viewport to a stale height
     while `overflow:hidden` clips the slide. Observing the element asks: did THIS box change size? */
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(resync);
    for (const s of slides) ro.observe(s);
  }

  show(0);
}
