import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { XIcon } from '../icons';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * Exit duration, and the only place it is written down. It is handed to CSS as
 * an inline --sheet-exit below rather than declared in :root, because the same
 * number has to drive two things — the exit animation and the unmount timer —
 * and if they drift the sheet either vanishes mid-slide or leaves a dead node
 * on screen. Deliberately shorter than --sheet (280ms): the enter is the
 * system presenting itself, the exit is the system answering the user.
 */
const EXIT_MS = 200;

/**
 * Drag-to-dismiss thresholds.
 *
 * SLOP is how far a finger travels before the gesture counts as a drag rather
 * than a tap that wandered — below it the sheet does not move at all, so a tap
 * on a control near the top of the panel is never stolen.
 *
 * A release dismisses on EITHER a distance or a flick, because they are two
 * different intentions: DISMISS_RATIO is "I have pushed this most of the way
 * down", measured against the panel's own height so a short Help sheet and a
 * tall Settings sheet both need the same proportion of a push. FLICK is a
 * velocity in px/ms — a fast, short throw is a dismissal too, and without it
 * the only way to close a tall sheet is a long deliberate drag.
 *
 * FLICK is measured over the last VELOCITY_WINDOW of the gesture, not over the
 * whole of it, and that distinction is what keeps the two tests meaning
 * different things. Averaged from touchstart, a deliberate half-pull that the
 * user stopped, thought better of, and released still carries the speed it had
 * on the way down; over a trailing window a finger that has come to rest reads
 * as ~0 whatever it did earlier.
 *
 * 0.5px/ms is 500px/s, and it is deliberately not the 0.11 the polish review
 * proposed. Measured: an unremarkable 40px pull over 90ms is already 0.44px/ms,
 * so at 0.11 essentially every drag qualifies as a throw, DISMISS_RATIO becomes
 * unreachable, and a sheet the user nudged and let go of closes anyway. A flick
 * has to be faster than a drag or it is not a separate gesture.
 */
const SLOP = 8;
const DISMISS_RATIO = 0.25;
const FLICK = 0.5;
const VELOCITY_WINDOW = 100;

/**
 * How many sheets currently hold the page scroll locked. A counter rather than
 * a boolean: the class is on a shared element, so the second sheet to unmount
 * would otherwise unlock the page while the first is still open. Only one
 * sheet opens at a time today — this is what keeps that from being load-bearing.
 */
let scrollLocks = 0;

/**
 * Bottom sheet: scrim, Escape to dismiss, focus moved in on open.
 *
 * It is a real `<dialog>` opened with showModal(), which is what makes its
 * modality true rather than merely announced. The previous version was a div
 * with `aria-modal="true"` and no focus trap, so it promised assistive tech a
 * containment it did not have: the background was hidden from the virtual
 * cursor but still reachable with Tab. showModal() supplies the trap, makes
 * the rest of the document inert, and restores focus to whatever opened the
 * sheet on close — all things this file would otherwise have to reimplement,
 * and the focus restore is one it never did (closing Settings dropped focus to
 * <body>, so the next Tab started from the top of the page rather than the
 * gear the user had just come from).
 *
 * Closing is a two-step: mark `closing` so the CSS can run the exit, then call
 * the parent's onClose once it has finished. Every dismissal path — scrim,
 * the X, Escape — goes through `close()` so none of them can skip the exit.
 */
export function Sheet({ title, onClose, children }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false);
  const exitTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // A ref, not the state, guards re-entry: a second tap during the exit lands
  // before the re-render, and scheduling the timer inside a state updater would
  // fire it twice under StrictMode's double-invoke.
  const closingRef = useRef(false);

  const close = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    exitTimer.current = setTimeout(onClose, EXIT_MS);
  }, [onClose]);

  useLayoutEffect(() => {
    const d = dialog.current;
    if (!d) return;
    // `if (!d.open)`: StrictMode invokes this twice, and showModal() on an
    // already-open dialog throws InvalidStateError.
    if (!d.open) d.showModal();
    // showModal() alone does not reliably stop the page behind from scrolling,
    // and a short sheet over a long Setup screen chains its scroll straight
    // through to the page: the sheet holds still while the world moves under it.
    if (scrollLocks++ === 0) document.documentElement.classList.add('sheet-open');
    return () => {
      if (--scrollLocks === 0) document.documentElement.classList.remove('sheet-open');
      clearTimeout(exitTimer.current);
      if (d.open) d.close();
    };
  }, []);

  /**
   * Put focus at the top of the panel, on open and again whenever the sheet
   * changes to a different view.
   *
   * On open it goes to the panel rather than where the dialog's own focusing
   * steps would send it — the first focusable descendant, which is the X, so a
   * screen reader would announce every sheet by its Close button.
   *
   * Keying it to `title` covers the swap SettingsSheet does in place: tapping
   * "How to Play" replaces the sheet's contents around the same dialog node,
   * and the button that was tapped is one of the things replaced. Focus was
   * landing on <body> as it was removed, so the new view began with focus
   * nowhere and the sheet's changed name went unannounced. Declared after the
   * effect above so the dialog is already showing when this first runs.
   */
  useLayoutEffect(() => {
    // Not during the exit: focus belongs to whatever the dialog restores it to.
    // preventScroll: focus() otherwise scrolls its element into view, and the
    // only thing a fixed, top-layer panel can be revealed by is scrolling the
    // page underneath it — which is the page this sheet has just locked in
    // place. Nothing to gain from the default here, and a scroll position to lose.
    if (!closingRef.current) panel.current?.focus({ preventScroll: true });
  }, [title]);

  /**
   * Leave the top layer as the exit BEGINS, not when the node finally unmounts.
   *
   * The node outlives the user's gesture by EXIT_MS, and a modal dialog makes
   * the whole document inert — so holding it open through the exit would spend
   * those 200ms swallowing every tap aimed at the app behind, which is exactly
   * the dropped-tap bug the pointer-events rule in index.css was written for
   * and which pointer-events cannot fix here (inertness is not hit-testing).
   * Closed, it drops back to an ordinary z-index: 50 overlay for the slide out.
   *
   * Layout effect, not passive: close() flips [open], and the `.closing` class
   * that keeps a closed dialog displayed has to be on the node before that
   * happens or the sheet blinks out for a frame and restarts its animation.
   */
  useLayoutEffect(() => {
    if (closing) dialog.current?.close();
  }, [closing]);

  /**
   * Drag-to-dismiss.
   *
   * Touch events only, and deliberately: a mouse already has the scrim, the X
   * and Escape, and doing this with pointer events means capture plus
   * click-suppression to stop a drag from ending in a stray activation. The
   * grabber in the panel is shown under `any-pointer: coarse` for the same
   * reason — the affordance appears exactly where the gesture exists.
   *
   * The transform is written straight to the node rather than held in state.
   * A drag produces a move event per frame, and re-rendering the whole sheet
   * (Settings holds the theme picker, two switches and the About block) 60
   * times a second to move one box is how a gesture ends up behind the finger.
   */
  const dragFrom = useRef<{ y: number; at: number } | null>(null);
  const dragging = useRef(false);
  /** How far the sheet is currently pulled down, in px. Read on release. */
  const dragBy = useRef(0);
  /** Trailing sample the release velocity is measured against — see FLICK. */
  const recent = useRef({ by: 0, at: 0 });

  const onTouchStart = (e: React.TouchEvent) => {
    // Not mid-exit, and not while the panel is scrolled: a Settings sheet
    // taller than the screen scrolls itself, and pulling down from anywhere
    // but its top has to keep meaning "scroll up".
    if (closingRef.current || (panel.current?.scrollTop ?? 0) > 0) return;
    const t = e.touches[0];
    dragFrom.current = { y: t.clientY, at: performance.now() };
    dragBy.current = 0;
    recent.current = { by: 0, at: dragFrom.current.at };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    const from = dragFrom.current;
    if (!from || !panel.current) return;
    const dy = e.touches[0].clientY - from.y;
    // Downward only. An upward pull on a sheet that is already at its top
    // means nothing, and rubber-banding it would imply there is more above.
    if (!dragging.current) {
      if (dy < SLOP) return;
      dragging.current = true;
      panel.current.classList.add('dragging');
    }
    // Retire the trailing sample only once it is older than the window, so at
    // release it is always between 0 and VELOCITY_WINDOW ms old.
    const now = performance.now();
    if (now - recent.current.at > VELOCITY_WINDOW) {
      recent.current = { by: dragBy.current, at: now };
    }
    dragBy.current = Math.max(0, dy);
    panel.current.style.transform = `translateY(${dragBy.current}px)`;
  };

  const onTouchEnd = () => {
    const from = dragFrom.current;
    const el = panel.current;
    dragFrom.current = null;
    if (!from || !dragging.current || !el) return;
    dragging.current = false;
    el.classList.remove('dragging');

    const travelled = dragBy.current;
    const velocity =
      (travelled - recent.current.by) / Math.max(1, performance.now() - recent.current.at);
    if (velocity > FLICK || travelled > el.offsetHeight * DISMISS_RATIO) {
      // The inline transform is left in place on purpose: the exit keyframe
      // has no `from`, so it starts from wherever the finger left the sheet
      // and carries it the rest of the way down rather than snapping to the
      // top of the slide first. An animation outranks an inline style, so it
      // wins for the duration and the node unmounts under it.
      close();
      return;
    }
    el.style.transform = '';
  };

  return (
    <dialog
      className={`sheet-backdrop${closing ? ' closing' : ''}`}
      style={{ '--sheet-exit': `${EXIT_MS}ms` } as CSSProperties}
      ref={dialog}
      aria-label={title}
      // Escape reaches the dialog as `cancel`, which closes it natively and
      // instantly. Cancelling that hands the dismissal back to close(), so the
      // keyboard path animates out like every other one.
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      // A click on the scrim lands on the dialog itself; one inside the sheet
      // lands on a descendant. Comparing target to currentTarget is what
      // separates them, and it replaces the stopPropagation the panel used to
      // need — clicks inside no longer have to be cancelled to stay harmless.
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        className="sheet"
        tabIndex={-1}
        ref={panel}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="sheet-close" onClick={close} aria-label="Close">
            <XIcon />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
