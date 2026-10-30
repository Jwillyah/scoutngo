# Working in this repo

**Read [docs/failure-modes.md](docs/failure-modes.md) before writing a check.**
Three shapes account for almost every real defect here, and the third one —
a check pointed at the wrong object — passes while reporting something else
entirely.

**Check every screen change against [docs/ux-rules.md](docs/ux-rules.md)**, and
end the run with a contact sheet of the touched screens at 390 × 844, browser
tab and standalone (`node scripts/contact-sheet.mjs out.png label=shot.png …`).

## The rules this codebase is built on

- **The model proposes, code computes.** Anything that is arithmetic lives in
  `src/core/` and overrides any model claim. The model is never asked for a
  bearing, a distance, a time or an angle.
- **Prove the diagnosis before writing the fix. Print the evidence.**
- **Never state something you do not know.** A dash and "the forecast did not
  say" beats a zero every time.
- **Every job ends with a test in the repo**, not a manual check.
- **The app never says an area is clear of hazards**, in any wording, from any
  source.

## Privacy, which is not negotiable

No IP geolocation, ever. The venue coordinate never leaves the device.
localStorage for what is yours (kit, spots, settings, saved forecasts); Cache
Storage holds map tiles and the app shell, nothing about the user. No account,
no database, no analytics, no telemetry.

## The gate

`.githooks/pre-commit` runs, in order:

```
tsc -b → oxlint --deny-warnings → viewport units → colour roles → clock
       → measurements → tests → build → build stamp → reachability → labels
       → gestures → standalone → viewfinder → fly → buildings → sky fire → surface → overflow → projection → offline → api urls → 3d network
       → airspace → call sheet → clock screen → service worker
```

`.githooks/pre-push` then builds the commit itself, not the working copy: a
clean temporary worktree at the pushed sha, `npm ci`, `tsc -b`, build, tests.
No `git stash` during a run; see failure-modes.md, "The gate built the disk".

All of it must be clean before reporting. `SCOUTNGO_SKIP_AUDITS=1` exists and
warns loudly; using it means saying so in the report.

## Measurements

Any comment, doc or report line containing the word **MEASURED** carries the
path of the file the run wrote it to. `scripts/audit-measurements.mjs` resolves
every reference and fails on a missing file or a numeral that does not appear
in it. Measuring scripts write to `measurements/<ISO-date>-<name>.md` and
record the run's parameters.

Do not backfill a measurement file to make the audit pass. An untraceable
claim gets re-measured or deleted, and that is the author's call, not a
formatting problem.

## Pushing

Pushing stays a thing the user asks for. Never add an auto-push. Every report
ends with the push state, and if anything is unpushed that goes in the first
line.
