import { useEffect, useState } from 'react';

export interface JumpTarget {
  id: string;
  label: string;
}

/**
 * A row of chips at the top of the Board tab, one per card below it.
 *
 * The Board is the money card plus one card per game, and with three or four
 * games the one you want is several thumb-lengths down a list that is the
 * same shape all the way. The chip for whichever card is at the top of the
 * screen is lit, so the row also says where you are.
 */
export function BoardJump({ targets }: { targets: JumpTarget[] }) {
  const [current, setCurrent] = useState(targets[0]?.id);

  // Keyed on the ids rather than the array, which is rebuilt every render.
  const ids = targets.map((t) => t.id).join('|');

  useEffect(() => {
    // Lighting the chip is a nicety; jumping works without it.
    if (typeof IntersectionObserver === 'undefined') return;
    const order = ids.split('|');
    // The card nearest the top of the viewport, below the sticky row, is the
    // one being read. rootMargin trims the observed band to the top third.
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting));
        const first = order.find((id) => seen.get(id));
        if (first) setCurrent(first);
      },
      { rootMargin: '-64px 0px -66% 0px' }
    );
    order.forEach((id) => {
      const el = document.getElementById(id);
      if (el) io.observe(el);
    });
    return () => io.disconnect();
  }, [ids]);

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setCurrent(id);
  };

  return (
    <nav className="board-jump" aria-label="Jump to">
      {targets.map((t) => (
        <button
          key={t.id}
          className={`board-jump-chip${current === t.id ? ' active' : ''}`}
          aria-current={current === t.id ? 'true' : undefined}
          onClick={() => jump(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
