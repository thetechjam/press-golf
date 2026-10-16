# Privacy

Press keeps score for golf side games. It has no accounts, no analytics and
no server that stores your rounds. This page says exactly what the app does
with your data, in plain English. It matches the code; if the code changes,
this page changes with it.

## Where your data lives

Everything Press saves — rounds, scores, players' names and handicaps,
stakes, saved courses, merged-name records and your settings — is stored in
your browser, on your device, in the browser's local storage for
pressgolf.netlify.app. Nothing is copied to a server. Press asks the browser
to treat that storage as persistent so it is not cleared when space is tight;
installing Press to your home screen is the surest way to keep it.

There are no cookies, no tracking pixels, no third-party scripts and no
usage analytics. The app's own files are cached on your device by a service
worker so it opens with no signal.

## What leaves your device, and when

Nothing leaves your device unless you do one of these things:

- **Course search.** When you type three or more characters into the course
  field on New Round, that text is sent to `api.opengolfapi.org` to look up
  matching courses, and picking a result fetches that course's scorecard from
  the same service. Course data is © OpenStreetMap contributors (ODbL 1.0) via
  OpenGolfAPI. Nothing about you or your round is sent — only what you typed.
- **Sending feedback.** Settings → Send feedback posts what you write — the
  report, and your name if you give one — together with a few diagnostics
  (which screen you were on, the app version and build, your browser's
  user-agent string, the screen size and the time) to Netlify Forms, the
  hosting company's form service, which emails it to the developer. The round
  you are on is included **only** if you tick "Include this round", which is
  off every time you open the form; ticking it sends the players' names,
  scores and settings. A report written with no signal waits on your device
  and is sent when you are back online.
- **Sharing a round by link or QR code.** The whole round — names, scores,
  handicaps, stakes, presses, junk — is packed into the link itself, after
  the `#`. Browsers never send that part of a link to any server, including
  ours, so the round goes only to whoever you give the link to. The link is
  **compressed, not encrypted**: anyone who has it can open it and read the
  names, scores and stakes inside, and it will sit in the history of whatever
  app you sent it through. Share a link the way you would share the scorecard
  itself.
- **Sharing an image or text.** The scoreboard and scorecard images are drawn
  on your device and handed to your phone's share sheet, or saved as a file.
  Where they go from there is up to you and the app you pick.
- **Backups.** Back up from Settings writes a plain JSON file containing every
  round, saved course and merged-name record on the device. It is not
  encrypted. You keep it; restoring one merges it back.
- **Links to other sites.** The tutorial (YouTube), the tip jar (Buy Me a
  Coffee) and the OpenStreetMap credit are ordinary links that open those
  sites, which have their own privacy policies. Nothing is sent to them until
  you tap.

Press is served by Netlify. Like any website, loading or updating the app
sends ordinary requests for its files, which the host sees as it would for
any site (your IP address, your browser). Press adds nothing to those
requests and reads nothing back from them.

## Deleting your data

- **Rounds:** Rounds → Select, pick the ones to remove, delete. Or the × on
  a single round's card.
- **Saved courses:** New Round → Course → the × beside a saved course.
- **Feedback waiting to send:** Settings → Clear waiting reports.
- **Everything at once:** Settings → Erase everything. The first tap says
  what goes; the second removes every round, saved course, player name,
  feedback waiting to send and setting Press has stored, and the app opens
  again as it did the first time. The same result without opening the app:
  clear the site's data in your browser (on iPhone, Settings → Safari →
  Advanced → Website Data; on Android Chrome, the site's page info → Site
  settings → Delete data), or uninstall the installed app.

A round that someone else sent you by link is not saved until you tap
"Keep it".

## Questions

Open an issue at github.com/thetechjam/press-golf, or use Send feedback in
the app. Press is made by one person; you will get a reply from him.
