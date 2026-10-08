import { lazy } from 'react';

/**
 * The screens a round can be scored without, split out of the first download.
 *
 * Home → Setup → Play → Results is the path every visit takes and stays in the
 * main bundle. Everything here is visited occasionally — Stats, the league,
 * trips, history, the arrival screens behind a shared link, and the share and
 * hand-over sheets with their QR encoder and canvas renderers — and was being
 * parsed on every launch to draw a Home screen that uses none of it.
 *
 * Offline is unaffected: the service worker precaches every chunk, so a lazy
 * screen loads from the cache with no signal exactly as the main bundle does.
 * `preloadScreens` fetches them all once the first screen is up, so by the
 * time anyone taps through to one it is already in memory.
 */
const loaders = {
  Stats: () => import('./screens/Stats'),
  History: () => import('./screens/History'),
  LeagueSetup: () => import('./screens/LeagueSetup'),
  LeagueStandings: () => import('./screens/LeagueStandings'),
  TripScreen: () => import('./screens/TripScreen'),
  Arrival: () => import('./screens/Arrival'),
  ArrivingCourse: () => import('./screens/ArrivingCourse'),
  ShareSheet: () => import('./components/ShareSheet'),
  SendRound: () => import('./components/SendRound'),
};

export const Stats = lazy(() => loaders.Stats().then((m) => ({ default: m.Stats })));
export const History = lazy(() => loaders.History().then((m) => ({ default: m.History })));
export const LeagueSetup = lazy(() =>
  loaders.LeagueSetup().then((m) => ({ default: m.LeagueSetup }))
);
export const LeagueStandings = lazy(() =>
  loaders.LeagueStandings().then((m) => ({ default: m.LeagueStandings }))
);
export const TripScreen = lazy(() => loaders.TripScreen().then((m) => ({ default: m.TripScreen })));
export const Arrival = lazy(() => loaders.Arrival().then((m) => ({ default: m.Arrival })));
export const ArrivingCourse = lazy(() =>
  loaders.ArrivingCourse().then((m) => ({ default: m.ArrivingCourse }))
);
export const ShareSheet = lazy(() => loaders.ShareSheet().then((m) => ({ default: m.ShareSheet })));
export const SendRound = lazy(() => loaders.SendRound().then((m) => ({ default: m.SendRound })));

/**
 * Warms every lazy chunk once the browser is idle. A failure is ignored: the
 * same import runs again when the screen is opened, and that is the one whose
 * failure matters.
 */
export function preloadScreens(): () => void {
  const run = () => {
    for (const load of Object.values(loaders)) load().catch(() => {});
  };
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1200);
  return () => window.clearTimeout(id);
}
