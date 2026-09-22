/**
 * A short vibration. The Vibration API is Android-only — a no-op on iOS
 * Safari and the installed PWA — so this is always a garnish, never the only
 * sign that something happened.
 */
export const buzz = (pattern: number | number[]) => navigator.vibrate?.(pattern);
