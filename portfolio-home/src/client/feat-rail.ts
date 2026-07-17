// The featured banner's curtains — the bit of the page that admits there is more of it. The banner is a
// horizontal scroller that said so only through a thin scrollbar, invisible on a phone. A card sliced
// flat by the viewport edge reads as a layout bug; fading that edge turns "this is broken" into "this
// continues".
//
// WHY A MASK AND NOT AN OVERLAY, each reason alone decisive:
//  1. A ::after on .feat-banner positions against the SCROLLED CONTENT, not the scrollport, so it would
//     slide off with the first card; pinning it needs a non-scrolling wrapper just to hold a gradient.
//  2. The page background isn't a colour — base.css paints two viewport-fixed radial gradients over --bg,
//     so a curtain fading to flat var(--bg) would be visibly wrong wherever the radials tint.
// A mask has neither problem: it applies to the element's own box (doesn't scroll) and fades to
// TRANSPARENT, not a guessed colour, so it can't mismatch a background it never names.

/**
 * Show a curtain on each side that has somewhere to go, none on a side that doesn't. A permanent
 * right-hand fade would be a lie at the strip's end — a swipe to disprove. The curtains are a readout
 * of scroll position, not decoration.
 */
export function featRail(): void {
  for (const rail of document.querySelectorAll<HTMLElement>('.feat-banner')) {
    // The stylesheet owns the curtain's width — see --feat-fade there. A phone also sizes the cards
    // against it, so the number has three readers and must have exactly one writer.
    const fade = getComputedStyle(rail).getPropertyValue('--feat-fade').trim() || '56px';

    const sync = (): void => {
      const first = rail.firstElementChild;
      const last = rail.lastElementChild;
      if (!first || !last) return;

      // ASK THE CARDS, NOT scrollLeft. The obvious `scrollLeft > 0` is wrong: at rest this strip sits at
      // scrollLeft = 2 (it has padding:2px, and scroll-snap parks the first card against the edge,
      // swallowing it), so `> 0` lit the left curtain permanently at the start. A fudge factor only moves
      // the lie — the padding is a stylesheet number that can change. "Is there more to the left?" is a
      // question about whether a card extends past the edge, so that's what's measured — immune to the
      // padding, to snap, and to fractional scrollLeft on a 2x DPR.
      const port = rail.getBoundingClientRect();
      const l = first.getBoundingClientRect().left < port.left - 1;
      // Everything fits => the last card ends inside the port => no curtain, at any width. It must not
      // claim more when there is none — a curtain at the end costs a swipe to disprove.
      const r = last.getBoundingClientRect().right > port.right + 1;

      rail.style.setProperty('--fade-l', l ? fade : '0px');
      rail.style.setProperty('--fade-r', r ? fade : '0px');
    };

    rail.addEventListener('scroll', sync, { passive: true });

    // Not a resize listener: a window change is neither necessary nor sufficient — a late web font or a
    // settling image re-lays the cards out with no window event. Observing the element asks the real
    // question.
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(sync);
      ro.observe(rail);
      // The scrollport can stay the same size while the CONTENT changes width, which moves `max`
      // without touching the element. The children are what actually decide whether there is more.
      for (const card of rail.children) ro.observe(card);
    }

    sync();
  }
}
