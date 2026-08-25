import { useCallback, useEffect, useRef, useState } from 'react';

export type FadeEdge = 'none' | 'left' | 'right' | 'both';

/**
 * Reports which edges of a horizontal scroller still hide content, so CSS can
 * fade exactly those and only those.
 *
 * The hole strip and the money ticker both hide their scrollbars, so at 375px
 * the 18th dot and the last player's money were cut off mid-glyph with nothing
 * to suggest more existed. A permanent mask is the wrong fix: in landscape both
 * strips fit, and an unconditional fade would dim a fully-visible last dot for
 * no reason. This measures instead of guessing.
 *
 * Recomputed on scroll, on resize of the element, and on child mutations — the
 * ticker's content changes as money moves, which can flip a strip that fits
 * into one that doesn't without any resize or scroll event firing.
 */
export function useEdgeFade<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [edge, setEdge] = useState<FadeEdge>('none');

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Sub-pixel layout leaves ~1px of phantom overflow on strips that visually
    // fit; 2px of slack keeps those reporting 'none'.
    const max = el.scrollWidth - el.clientWidth;
    if (max <= 2) return setEdge('none');
    const atStart = el.scrollLeft <= 2;
    const atEnd = el.scrollLeft >= max - 2;
    setEdge(atStart ? 'right' : atEnd ? 'left' : 'both');
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const mo = new MutationObserver(measure);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    return () => {
      el.removeEventListener('scroll', measure);
      ro.disconnect();
      mo.disconnect();
    };
  }, [measure]);

  return { ref, edge };
}
