# Contributing to Press

Thanks for looking. Press is a small, solo-maintained app, so the bar is
"keeps working on a phone with no signal" rather than ceremony.

## Setup

Node **24** (`.nvmrc`; `nvm use` or `mise install`). Then:

```bash
npm ci
npm run dev            # local dev server; add -- --host to test on a phone
npm run test           # vitest — engines in node, screens in happy-dom
npm run typecheck      # tsc -b --noEmit
npm run lint           # oxlint
npm run build          # what Netlify runs
```

CI runs all four on every push and pull request; a PR needs them green.

## The one rule about data

Rounds live on people's phones, travel in URL fragments (`src/shareLink.ts`),
and sit in backup files (`src/backup.ts`) that may be years old when they are
restored. So changes to `Round`, `GameOptions`, the share payload and the
backup file are **additive only**:

- add optional fields; never rename, remove, or change the meaning of one;
- an absent field must mean what every round saved before it existed meant
  (see the comments on `netByGame`, `vegasFlip` and `ratingHoles` in
  `src/types.ts` for the pattern);
- bump `SHARE_FORMAT` / `COURSE_FORMAT` / `BACKUP_FORMAT` only for a change an
  old app genuinely cannot read, and give the reader a message when it meets
  a newer one (they already do).

If a change needs a migration, write it down in the PR and add a test that
feeds the old shape through the new reader.

## Tests

Every scoring change comes with a test in `src/games/*.test.ts`; the engines
are pure functions of a `Round`, and `src/games/testFixtures.ts` builds one.
Screen changes get a `*.dom.test.tsx` (happy-dom, Testing Library) when the
behaviour can be asserted without pixels. Nothing in the suite touches the
network.

## Style

Plain CSS with custom properties, no component library, no new runtime
dependencies without a conversation first. Comments say *why*; the code
already says what.

## License

Press is released under the PolyForm Noncommercial License 1.0.0 (see
`LICENSE`). By contributing you agree your contribution is licensed under the
same terms. Commercial rights stay with the copyright holder; if that matters
to you, open an issue before writing code.
