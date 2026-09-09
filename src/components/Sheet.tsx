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
      <div className="sheet" tabIndex={-1} ref={panel}>
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
