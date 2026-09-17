/**
 * Where the tip jar points, and whether there is one at all.
 *
 * Press is free, has no ads and no account, and is not going to grow any. The
 * one thing it asks for is a coffee, in one row at the bottom of Settings,
 * below everything the app is actually for.
 *
 * The handle lives here rather than inline in the row because an empty handle
 * has to mean *no row* rather than a link to `buymeacoffee.com/` — a tip jar
 * that 404s is worse than no tip jar, and a handle is exactly the kind of
 * thing that gets pasted in half-finished. `tipJarUrl()` returning null is the
 * single check the row makes, so the dead-link case cannot be forgotten at a
 * call site.
 */

/** The Buy Me a Coffee handle. Empty string means Press asks for nothing. */
export const TIP_JAR_HANDLE = 'thetechjam';

/**
 * The page to open, or null when there is no jar to open.
 *
 * Takes the handle rather than reading the constant, so the empty case is a
 * thing tests can reach. A guard nothing can exercise is a guard nobody knows
 * still works.
 */
export function tipJarUrl(handle: string = TIP_JAR_HANDLE): string | null {
  const trimmed = handle.trim();
  return trimmed ? `https://buymeacoffee.com/${trimmed}` : null;
}
