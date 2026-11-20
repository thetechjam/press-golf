import { useState, useEffect, useRef, Suspense } from 'react';
import type { Round, SavedCourse } from './types';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { Play } from './screens/Play';
import { Results } from './screens/Results';
import { saveRound, getRound, listCourses, saveCourse, ROUNDS_KEY, COURSES_KEY } from './storage';
import { kv } from './kv';
import { UpdatePrompt } from './components/UpdatePrompt';
import { dismissSplash } from './splash';
import { createNavigator } from './navigation';
import { decodeRound, sharedFromHash } from './shareLink';
import { decodeCourse, courseClash, asSeparateCourse, type CourseClash } from './shareCourse';
import type { CourseChoice } from './screens/ArrivingCourse';
import { compareRounds, forkRound, type Arrival as ArrivalState } from './handover';
import type { Resolution } from './screens/Arrival';
import {
  Arrival,
  ArrivingCourse,
  History,
  LeagueSetup,
  LeagueStandings,
  ScrambleSetup,
  Stats,
  TripScreen,
  preloadScreens,
} from './lazyScreens';

const VIEWS = [
  'home',
  'setup',
  'leagueSetup',
  'scrambleSetup',
  'play',
  'results',
  'stats',
  'history',
  'standings',
  'trip',
] as const;
type View = (typeof VIEWS)[number];

const isView = (v: unknown): v is View =>
  typeof v === 'string' && (VIEWS as readonly string[]).includes(v);

/** What is happening with a round arriving in the address bar, if one is. */
type Incoming =
  | { state: 'opening' }
  | { state: 'failed'; message: string }
  /** Decoded, but this device already has the round and someone has to choose. */
  | { state: 'deciding'; round: Round; arrival: ArrivalState }
  /** A course arrived; it is previewed and saved only when asked for. */
  | { state: 'course'; course: SavedCourse; clash: CourseClash }
  | null;

export default function App() {
  const [view, setView] = useState<View>('home');
  // Which trip the Trip screen shows. Held here rather than in the view name,
  // which the history stack keeps as a fixed set of screens.
  const [tripId, setTripId] = useState<string | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  // Read synchronously so the first paint is the shared round opening rather
  // than the Home screen flashing up and being replaced a frame later.
  const [incoming, setIncoming] = useState<Incoming>(() =>
    sharedFromHash(window.location.hash) ? { state: 'opening' } : null
  );
  /**
   * True while the round on screen came from a link and has not been kept.
   *
   * Somebody else's round is not written to this device until it is asked for.
   * Saving it silently would put rounds the user never played into their
   * history and their stats, and there is no undo for that short of finding
   * the round and deleting it.
   */
  const [unkept, setUnkept] = useState(false);
  /**
   * True from a save that failed until one succeeds. Storage full is the
   * realistic cause, and the one thing worse than losing the round on
   * reload is doing so after an hour of scoring that looked saved.
   */
  const [unsaved, setUnsaved] = useState(false);
  // A course that arrived by link and could not be stored. Separate from
  // `unsaved`, which is about the round: a course write succeeding says
  // nothing about whether the round on the card is kept.
  const [courseUnsaved, setCourseUnsaved] = useState(false);

  // The history/back-gesture logic lives in navigation.ts, where it can be
  // tested against a history double that models asynchronous traversal — a DOM
  // test environment pops synchronously inside go() and so cannot reproduce
  // the double-tap race the collapse guard exists for. Built once and kept in
  // a ref: it owns mutable state that must not be rebuilt on a render.
  const navRef = useRef<ReturnType<typeof createNavigator<View>> | null>(null);
  if (navRef.current === null) {
    navRef.current = createNavigator<View>({
      history: window.history,
      home: 'home',
      isView,
      onView: setView,
    });
  }
  const nav = navRef.current;

  // Fade out index.html's splash now that there is an app painted under it.
  // It runs from here rather than main.tsx so it cannot outrun React's initial
  // commit — see splash.ts.
  useEffect(dismissSplash, []);
  useEffect(preloadScreens, []);

  /**
   * Move focus to the new screen's heading on every view change.
   *
   * A view swap unmounts the control that was just activated, so focus falls
   * to <body>: the next Tab starts over from the top of the document, and a
   * screen reader is told nothing at all about the screen that just arrived —
   * the same defect Sheet.tsx fixes when its own contents are replaced around
   * it, one level up. Each screen's <h1> carries tabIndex={-1} to receive this.
   *
   * Deliberately NOT preventScroll, unlike the sheet's: focus() scrolling the
   * heading into view is what puts a new screen at its top, and a screen
   * change is the one moment where inheriting the previous screen's scroll
   * position is wrong.
   */
  const navigated = useRef(false);
  /** A shared payload taken out of the URL but not yet opened — see below. */
  const pendingShare = useRef<ReturnType<typeof sharedFromHash>>(null);
  useEffect(() => {
    // Not on first paint — nothing has been navigated away from yet, and
    // taking focus on load only fights whatever the user is already doing.
    if (!navigated.current) {
      navigated.current = true;
      return;
    }
    // A lazy screen may not have arrived yet (see lazyScreens.ts), so the
    // heading is waited for rather than assumed. Almost always it is already
    // there; the observer is the cold-cache case.
    const focusHeading = () => {
      const h = document.querySelector<HTMLElement>('.screen h1');
      h?.focus();
      return !!h;
    };
    if (focusHeading()) return;
    const watch = new MutationObserver(() => {
      if (focusHeading()) watch.disconnect();
    });
    watch.observe(document.body, { childList: true, subtree: true });
    const stop = window.setTimeout(() => watch.disconnect(), 5000);
    return () => {
      watch.disconnect();
      window.clearTimeout(stop);
    };
  }, [view]);

  // Without this, the Android back gesture exits an installed PWA mid-round.
  useEffect(() => {
    nav.start();
    const onPop = (e: PopStateEvent) => nav.handlePop(e.state);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [nav]);

  /**
   * A screen whose round or trip is not in memory goes Home.
   *
   * History entries outlive the page. After a reload — "Reload Trunk" from
   * the error screen, or the phone discarding the tab — start() reseeds only
   * the current entry, and the ones beneath it still say Results, Play or
   * Trip while the round and trip they showed are gone. Back then landed on
   * an empty app with nothing to press. Replacing with Home collapses the
   * stale entry rather than stacking over it, so the next Back goes on down
   * instead of returning to the blank. Every in-app route sets the round or
   * trip in the same batch as the view, so this only ever meets a stale one.
   */
  const missing =
    (view === 'trip' && !tripId) || ((view === 'play' || view === 'results') && !round);
  useEffect(() => {
    if (missing) nav.replace('home');
  }, [missing, nav]);

  /**
   * The round on screen, read again from storage on leaving the Trip screen.
   *
   * The Trip screen writes rounds directly — a rename reaches every round on
   * the trip, and taking one off clears its `trip` — while App still holds
   * the round as it was when Results opened the trip. Back, by gesture or
   * button, returned to that stale copy, and the next edit of anything saved
   * it whole: the old trip name, or the trip it had just been taken off,
   * written back over the change. Reading it again here is cheaper than
   * routing every Trip write through App. A round storage no longer has is
   * left as it is rather than dropped from under the user.
   */
  const shownView = useRef(view);
  useEffect(() => {
    const from = shownView.current;
    shownView.current = view;
    if (from !== 'trip' || view === 'trip') return;
    setRound((r) => (r ? (getRound(r.id) ?? r) : r));
  }, [view]);

  /**
   * A round arriving in the address bar.
   *
   * Handled on mount and again on `hashchange`, because those are two
   * genuinely different arrivals. Following a link with Trunk closed loads the
   * page; following one with Trunk already open on the same origin changes
   * only the fragment, which is a same-document navigation — no reload, no
   * remount, and without the listener, tapping a mate's link while looking at
   * the app does nothing at all.
   *
   * The payload is taken out of the URL before anything else happens: it is
   * hundreds of characters long, a refresh would re-open it over whatever the
   * user had moved on to, and it would otherwise be carried into the next link
   * shared from this page. Decoding is asynchronous, so the navigation below
   * lands after the effect above has seeded the history stack.
   */
  useEffect(() => {
    let live = true;

    const open = () => {
      // The payload is read from the URL once and then held here, because the
      // URL is stripped below. Under StrictMode the effect runs, is cleaned up
      // and runs again: the first run had already stripped the hash and its
      // result was discarded as stale, so the second found nothing to open
      // and a shared link sat on "Opening round…" for good. The second run
      // now picks the payload up from here and finishes the job.
      const shared = sharedFromHash(window.location.hash) ?? pendingShare.current;
      if (!shared) return;
      pendingShare.current = shared;
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setIncoming({ state: 'opening' });

      if (shared.kind === 'course') {
        void decodeCourse(shared.payload).then((result) => {
          if (!live) return;
          pendingShare.current = null;
          if (!result.ok) return setIncoming({ state: 'failed', message: result.error });
          setIncoming({
            state: 'course',
            course: result.course,
            clash: courseClash(result.course, listCourses()),
          });
        });
        return;
      }

      void decodeRound(shared.payload).then((result) => {
        if (!live) return;
        pendingShare.current = null;
        if (!result.ok) return setIncoming({ state: 'failed', message: result.error });

        // A round this device has never seen is simply shown, unkept. One it
        // already has is a question about the user's own data, and gets asked
        // before anything is written — see handover.ts.
        const arrival = compareRounds(result.round, getRound(result.round.id));
        if (arrival.kind !== 'new') {
          return setIncoming({ state: 'deciding', round: result.round, arrival });
        }
        setRound(result.round);
        setUnkept(true);
        setIncoming(null);
        nav.goTo('results');
      });
    };

    open();
    window.addEventListener('hashchange', open);
    return () => {
      live = false;
      window.removeEventListener('hashchange', open);
    };
  }, [nav]);

  const goTo = (next: View) => nav.goTo(next);
  const openTrip = (id: string) => {
    setTripId(id);
    goTo('trip');
  };

  /**
   * Puts a different round on screen.
   *
   * Clearing `unkept` here rather than at each call site is what stops the
   * flag outliving the round it describes — left set, it would go on
   * suppressing the save for the next round the user actually played.
   */
  const load = (next: Round | null) => {
    setRound(next);
    setUnkept(false);
  };

  const update = (next: Round) => {
    setRound(next);
    // An unkept round is edited on Results but not written down — correcting a
    // score before deciding whether to keep it is reasonable; being given a
    // round in the history because you fixed somebody's typo is not. The card
    // is different; see updateFromCard.
    if (!unkept) setUnsaved(!saveRound(next));
  };

  /**
   * Writes a round the user has decided to keep.
   *
   * False leaves whatever is already on screen alone: a failed save used to
   * be ignored, so the round looked stored and was gone on the next launch.
   * The banner is the same one scoring uses; the round stays up so the write
   * can be tried again.
   */
  const persistRound = (next: Round): boolean => {
    const ok = saveRound(next);
    setUnsaved(!ok);
    return ok;
  };

  /**
   * Writes a round that arrived by link onto this device, once asked.
   *
   * A round still being played goes straight to the card, because taking one
   * on is not filing it away — it is agreeing to keep score, and the next
   * thing that happens is somebody hitting a shot. A refusal leaves the
   * "sent to you" row up, so keeping it can be tried again.
   */
  const keep = () => {
    if (!round) return;
    if (!persistRound(round)) return;
    setUnkept(false);
    // In place of Results, as "Back to the scorecard" and Finish both are.
    // Pushed on top, Finish then replaced the card with a second Results and
    // one Back press went from Results to the same Results.
    if (round.status !== 'finished') nav.replace('play');
  };

  /**
   * A change made on the card, where entering a score is keeping score.
   *
   * Results can hold a sent round back unsaved because Results says so: the
   * "Sent to you" banner is on screen beside every correction. The card has
   * no such banner, and "‹ Back to the scorecard" reaches it with the link
   * already gone from the address bar, so a hole scored there on an unkept
   * round was lost without a word. The first change on the card therefore
   * takes the round on exactly as "Take it on" does — keep()'s own reasoning,
   * that taking a round on is agreeing to keep score. Merely opening the card
   * writes nothing: looking at it is not scoring it, and it is a change made
   * there that would otherwise be lost. A refused write leaves the round
   * unkept, with the banner up, and the next change tries again.
   */
  const updateFromCard = (next: Round) => {
    if (!unkept) return update(next);
    setRound(next);
    if (persistRound(next)) setUnkept(false);
  };

  // Results stands in for the round that just finished rather than stacking
  // on top of it, and "back to the card" undoes that: each Finish/Back cycle
  // used to add two history entries, all of which the Android back gesture
  // then had to walk through to reach Home.
  const finish = () => {
    if (!round) return;
    // Finish is only offered on the card, so it keeps a sent round too.
    updateFromCard({ ...round, status: 'finished' });
    nav.replace('results');
  };

  /** Applies what the user chose about a round that this device already had. */
  const resolve = (incomingRound: Round, resolution: Resolution) => {
    if (resolution.action === 'open-mine') {
      // Nothing is written: the copy here is already the one being opened.
      // A failed replace or fork before this choice is moot now, and its
      // banner would claim the stored round is not saved.
      const mine = getRound(incomingRound.id);
      setUnsaved(false);
      setIncoming(null);
      load(mine ?? incomingRound);
      nav.goTo('results');
      return;
    }
    // Replace and fork both write. A refusal leaves the decision on screen —
    // the arriving card is still in `incoming` — rather than dropping it and
    // pretending the phone now holds it.
    const next = resolution.action === 'replace' ? incomingRound : forkRound(incomingRound);
    if (!persistRound(next)) return;
    setIncoming(null);
    load(next);
    nav.goTo('results');
  };

  /** Applies what the user chose about a course that arrived by link. */
  const resolveCourse = (course: SavedCourse, choice: CourseChoice) => {
    if (choice === 'skip') {
      setCourseUnsaved(false);
      setIncoming(null);
      return;
    }
    // `saveCourse` upserts by id, so replacing means reusing the local record's
    // id and saving separately means taking a fresh one — which is exactly
    // what `asSeparateCourse` hands back.
    const mine = listCourses();
    const existing = mine.find(
      (c) => c.name.trim().toLowerCase() === course.name.trim().toLowerCase()
    );
    const toSave =
      choice === 'replace' && existing
        ? { ...course, id: existing.id }
        : choice === 'both'
          ? asSeparateCourse(course, mine)
          : course;
    // Stay on the card when the write fails. The payload has already been
    // taken out of the address bar, so leaving this screen would drop the
    // only copy of the course still on the phone.
    if (!saveCourse(toSave)) {
      setCourseUnsaved(true);
      return;
    }
    setCourseUnsaved(false);
    setIncoming(null);
  };

  if (incoming?.state === 'course') {
    return (
      <div className="app">
        {courseUnsaved && <NotSavedBanner what="course" />}
        <Suspense fallback={null}>
          <ArrivingCourse
            course={incoming.course}
            clash={incoming.clash}
            onChoose={(choice) => resolveCourse(incoming.course, choice)}
          />
        </Suspense>
      </div>
    );
  }

  if (incoming?.state === 'deciding') {
    return (
      <div className="app">
        {unsaved && <NotSavedBanner />}
        <Suspense fallback={null}>
          <Arrival
            incoming={incoming.round}
            arrival={incoming.arrival}
            onResolve={(resolution) => resolve(incoming.round, resolution)}
          />
        </Suspense>
      </div>
    );
  }

  if (incoming) {
    return (
      <div className="app">
        <div className="screen arriving">
          <h1 tabIndex={-1}>{incoming.state === 'opening' ? 'Opening round…' : 'Can’t open that link'}</h1>
          {incoming.state === 'failed' && (
            <>
              <p className="arriving-note">{incoming.message}</p>
              <button className="btn-primary big" onClick={() => setIncoming(null)}>
                Go to Trunk
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      {/* Mounted on every view so the service worker registers on every load;
          the prompt itself stays hidden while a round is being scored. */}
      <UpdatePrompt suppressed={view === 'play'} />

      {unsaved && <NotSavedBanner />}

      {/* No fallback: the chunks are preloaded at idle, so the wait is a frame
          or two at most, and a spinner flashing for that long is worse than
          nothing. */}
      <Suspense fallback={null}>

      {view === 'home' && (
        <Home
          onNew={() => {
            load(null);
            goTo('setup');
          }}
          onNewLeague={() => {
            load(null);
            goTo('leagueSetup');
          }}
          onNewScramble={() => {
            load(null);
            goTo('scrambleSetup');
          }}
          onResume={(r) => {
            load(r);
            goTo('play');
          }}
          onViewResults={(r) => {
            load(r);
            goTo('results');
          }}
          onStats={() => goTo('stats')}
          onHistory={() => goTo('history')}
          onTrip={openTrip}
        />
      )}

      {view === 'stats' && <Stats onBack={() => goTo('home')} />}

      {view === 'history' && (
        <History
          onBack={() => goTo('home')}
          onResume={(r) => {
            load(r);
            goTo('play');
          }}
          onViewResults={(r) => {
            load(r);
            goTo('results');
          }}
        />
      )}

      {view === 'standings' && (
        <LeagueStandings
          onBack={() => goTo('leagueSetup')}
          onViewResults={(r) => {
            load(r);
            goTo('results');
          }}
        />
      )}

      {view === 'trip' && tripId && (
        <TripScreen
          tripId={tripId}
          onBack={() => goTo('home')}
          onOpenRound={(r) => {
            load(r);
            goTo(r.status === 'finished' ? 'results' : 'play');
          }}
        />
      )}

      {view === 'setup' && (
        <Setup
          onCancel={() => goTo('home')}
          onStart={(r) => {
            load(r);
            persistRound(r);
            // In place of Setup: Back from a round just started goes Home.
            // Popping to a blank Setup over a saved round invited starting it
            // twice. A failed save still opens the card — the round is in
            // memory, and the banner says it is not on the phone yet.
            nav.replace('play');
          }}
        />
      )}

      {view === 'leagueSetup' && (
        <LeagueSetup
          onCancel={() => goTo('home')}
          onStandings={() => goTo('standings')}
          onStart={(r) => {
            load(r);
            persistRound(r);
            nav.replace('play');
          }}
        />
      )}

      {view === 'scrambleSetup' && (
        <ScrambleSetup
          onCancel={() => goTo('home')}
          onStart={(r) => {
            load(r);
            persistRound(r);
            nav.replace('play');
          }}
        />
      )}

      {view === 'play' && round && (
        <Play round={round} onChange={updateFromCard} onFinish={finish} onExit={() => goTo('home')} />
      )}

      {view === 'results' && round && (
        <Results
          round={round}
          onChange={update}
          onHome={() => goTo('home')}
          onBackToPlay={() => nav.replace('play')}
          unkept={unkept}
          onKeep={keep}
          onTrip={openTrip}
        />
      )}
      </Suspense>
    </div>
  );
}

/**
 * A write storage refused. Shown wherever a round or course is still on screen.
 *
 * Two reasons, and the advice differs. Usually storage is full. In the native
 * shell the key may instead be one Trunk could not read at startup, which it
 * refuses to write over — deleting rounds would not help that, reopening does.
 */
function NotSavedBanner({ what = 'round' }: { what?: 'round' | 'course' }) {
  if (kv.isUnreadable(what === 'course' ? COURSES_KEY : ROUNDS_KEY)) {
    return what === 'course' ? (
      <div className="unsaved" role="alert">
        <strong>Not saved.</strong> Trunk couldn’t read your saved courses when it opened, so it
        won’t write over them and this course could not be kept. Close Trunk completely, open it
        again, and open the link again.
      </div>
    ) : (
      <div className="unsaved" role="alert">
        <strong>Not saved.</strong> Trunk couldn’t read your saved rounds when it opened, so it
        won’t write over them and scores entered now are not being kept. Note the scores, then
        close Trunk completely and open it again.
      </div>
    );
  }
  if (what === 'course') {
    return (
      <div className="unsaved" role="alert">
        <strong>Not saved.</strong> This phone’s storage is full, so this course could not be
        kept. Back up from Settings, then delete old rounds from Rounds to make room, and open
        the link again.
      </div>
    );
  }
  return (
    <div className="unsaved" role="alert">
      <strong>Not saved.</strong> This phone’s storage is full, so scores entered now will be
      lost if Trunk is closed. Back up from Settings, then delete old rounds from Rounds to
      make room.
    </div>
  );
}
