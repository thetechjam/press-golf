/**
 * Sunlight mode: forces the high-contrast light theme regardless of the
 * system appearance, for readability in direct daylight. The `.sunlight`
 * class on <html> disables every prefers-color-scheme:dark rule and swaps
 * in brighter, higher-contrast variables (see index.css).
 */
export const applySunlight = (on: boolean): void => {
  document.documentElement.classList.toggle('sunlight', on);
};
