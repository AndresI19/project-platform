/**
 * Drag-to-pan for oversized artwork — the quiz garden. The image is shown wider/taller than its
 * frame; press and swipe moves it within the frame so a visitor can see the whole scene.
 *
 * Pointer events cover mouse and touch in one path. `touch-action: none` on the frame (set in CSS) is
 * what stops a vertical swipe from scrolling the page instead of panning — without it, the browser
 * claims the gesture and the image never moves on a phone. Pointer capture keeps the drag alive when
 * the finger/cursor leaves the frame mid-swipe.
 */
export function mountGardenPan(): void {
  document.querySelectorAll<HTMLElement>('[data-pan]').forEach((frame) => {
    const img = frame.querySelector<HTMLImageElement>('.pan-img');
    if (!img) return;

    let x = 0;
    let y = 0;
    let originX = 0;
    let originY = 0;
    let dragging = false;

    // Clamp so an edge of the image can never pull inside the frame — you can reach every part of the
    // scene but never drag past it into empty space. offsetWidth/Height are the rendered image size.
    const apply = (): void => {
      const minX = Math.min(0, frame.clientWidth - img.offsetWidth);
      const minY = Math.min(0, frame.clientHeight - img.offsetHeight);
      x = Math.max(minX, Math.min(0, x));
      y = Math.max(minY, Math.min(0, y));
      img.style.transform = `translate(${x}px, ${y}px)`;
    };

    // Start centred, so the first drag in any direction reveals an edge rather than dead space.
    const centre = (): void => {
      x = (frame.clientWidth - img.offsetWidth) / 2;
      y = (frame.clientHeight - img.offsetHeight) / 2;
      apply();
    };
    if (img.complete && img.offsetWidth) centre();
    else img.addEventListener('load', centre, { once: true });

    frame.addEventListener('pointerdown', (e) => {
      dragging = true;
      originX = e.clientX - x;
      originY = e.clientY - y;
      frame.setPointerCapture(e.pointerId);
      frame.classList.add('grabbing');
    });
    frame.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      x = e.clientX - originX;
      y = e.clientY - originY;
      apply();
    });
    const end = (e: PointerEvent): void => {
      dragging = false;
      frame.classList.remove('grabbing');
      try {
        frame.releasePointerCapture(e.pointerId);
      } catch {
        // capture may already be gone (pointercancel) — nothing to release.
      }
    };
    frame.addEventListener('pointerup', end);
    frame.addEventListener('pointercancel', end);
    // Re-centre on resize: the frame width changes with the viewport, so the clamp bounds do too.
    window.addEventListener('resize', apply);
  });
}
