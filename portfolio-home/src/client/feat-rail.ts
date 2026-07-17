// The featured banner's curtains — the bit of the page that admits there is more of it.
//
// The banner is a horizontal scroller and said so only through a thin scrollbar underneath, which on
// a phone is a hairline that appears while you drag and is gone before you look. A card sliced flat
// by the viewport edge reads as a layout bug, not as an invitation: the cut is crisp, so it looks
// deliberate and finished. Fading that edge is what turns "this is broken" into "this continues".
//
// WHY A MASK AND NOT AN OVERLAY. Two reasons, and each one alone is decisive:
//
//  1. A ::after on .feat-banner is positioned against the SCROLLED CONTENT, not the scrollport — so
//     it would sit over the first card, slide away the moment you panned, and be somewhere off in the
//     middle of the strip by the time you reached the end. Pinning it would need a non-scrolling
//     wrapper element that exists purely to hold a gradient.
//  2. The page background is not a colour. base.css paints two radial gradients over --bg, fixed to
//     the viewport — so a curtain fading to a flat var(--bg) would be visibly wrong exactly where the
//     radials tint, which is most of the page.
//
// A mask has neither problem: it applies to the element's own box (it does not scroll), and it fades
// content to TRANSPARENT rather than to a guessed colour, so whatever is really behind shows through.
// It cannot mismatch a background it never has to name.

/**
 * Show a curtain on each side that has somewhere to go, and none on a side that doesn't.
 *
 * A permanent right-hand fade would be a lie at the end of the strip — the reader pans, nothing
 * changes, and the affordance has cost them a swipe to disprove. The curtains are a readout of
 * scroll position, not decoration.
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

      // ASK THE CARDS, NOT scrollLeft.
      //
      // The obvious version — `scrollLeft > 0` and `scrollLeft < scrollWidth - clientWidth` — is
      // wrong here, and measuring is how that turned up: at rest this strip sits at scrollLeft = 2,
      // not 0, because it carries `padding: 2px` and scroll-snap parks the first card against the
      // scrollport edge, swallowing the padding. So `> 0` lit the left curtain permanently, on a
      // strip that was already at its start. A bigger fudge factor would only move the lie: the
      // padding is a number in a stylesheet that can change, and any constant here would silently
      // stop matching it.
      //
      // "Is there more to the left?" is not a question about scrollLeft. It is a question about
      // whether a card extends past the edge — so that is what is measured. Immune to the padding,
      // to snap, and to the fractional scrollLeft a 2x device pixel ratio produces.
      const port = rail.getBoundingClientRect();
      const l = first.getBoundingClientRect().left < port.left - 1;
      // Everything fits => the last card ends inside the port => no curtain, at any width. The
      // desktop banner overflows too, so this is not a phone feature — but it must not claim there
      // is more when there is not: a curtain at the end costs the reader a swipe to disprove.
      const r = last.getBoundingClientRect().right > port.right + 1;

      rail.style.setProperty('--fade-l', l ? fade : '0px');
      rail.style.setProperty('--fade-r', r ? fade : '0px');
    };

    rail.addEventListener('scroll', sync, { passive: true });

    // Not a resize listener: the WINDOW changing is neither necessary nor sufficient. A late web font
    // or an image settling re-lays the cards out with no window event at all, and the strip would
    // keep claiming an overflow it no longer has. Observing the element asks the real question.
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
