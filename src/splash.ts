/**
 * Hand the screen from the static splash (index.html) to the mounted app.
 *
 * The splash markup is a SIBLING of #root, not a child, precisely so this can
 * happen: as a child, createRoot().render() deleted it the instant React
 * mounted and deep-green felt cut to the app background in a single frame,
 * with .screen's own screen-in slide then starting independently. Outside
 * #root it survives the mount and can fade over that slide, so the two read as
 * one entrance rather than a cut followed by an animation.
 *
 * Call it from a mount effect, never straight after render(): React's initial
 * commit is scheduled, so a bare call could start the fade off a screen the
 * app has not painted into yet. Idempotent — StrictMode runs mount effects
 * twice in dev, and the second call finds nothing left to remove.
 */
export function dismissSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;
  // Someone who asked for no motion gets no fade — and with no transition
  // there is no transitionend to wait on, so the node has to go now rather
  // than via the listener below.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    splash.remove();
    return;
  }
  splash.addEventListener('transitionend', () => splash.remove(), { once: true });
  // A backstop, not a second copy of the 260ms duration in index.html. If the
  // transition never runs — interrupted, or the tab hidden across the whole
  // mount — transitionend never fires, and an opacity-0 splash then sits in
  // the accessibility tree forever announcing "Press, Golf side games" over
  // the app. Deliberately far longer than the fade so it cannot pre-empt it.
  setTimeout(() => splash.remove(), 1000);
  splash.classList.add('done');
}
