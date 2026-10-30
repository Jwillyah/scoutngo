# Three ways this codebase goes wrong

Not a style guide. Three shapes that produced almost every real defect in this
repo, each with the instances, each with the structural fix.

Read this before writing a check.

---

## A · Two sources for one fact

Two values that must agree, with nothing making them agree. They drift, and
when they disagree nothing in the code can say which one is right.

**Instances**

| the two sources | how it showed up |
|---|---|
| the lens record and the lens label | a label said one optic, the geometry used another |
| the build stamp and git status | the app reported a build that was not deployed |
| the ray's screen rule and its ground floor | `BEARING_LINE_MIN_METERS` overrode the screen cap at z19, fraction 0.92 against a wanted 0.28 |
| the refraction convention on each side of one crossing | the flat horizon used the corrected −0.833, the ridge used a raw angle; a *perfectly flat* DEM disagreed with the flat line by two minutes |
| suncalc's altitude and the alignment finder's rise and set, until 29 Oct | `HORIZON_ALTITUDE` was the geometric −0.833 (sun) and +0.133 (moon); suncalc 2.0 returns an apparent altitude with refraction already in it. An alignment aimed at the sunrise point came 2.5 minutes before suncalc's sunrise and 0.38° north of it, the moon 2.5 minutes late. Now derived from suncalc's own refraction and moon-rise height, and held to suncalc's times in tests/lineup.test.ts |
| each screen's weather request and the next screen's, until 30 Oct | the chips, Sky fire, Preview, Special light (twice) and the Wind page each asked Open-Meteo on their own, and the chips asked again on every hour of the time bar for a day already in hand: 33 requests weighing 233.7 calls in five minutes of use (measurements/2026-10-30-weather-requests-before.md). At Virginia Beach Wind and Cloud said "no data". One store now (src/lib/weatherStore.ts), keyed on the request: 9 requests, 60.2 (measurements/2026-10-30-weather-requests-after.md); `scripts/audit-weather.mjs` holds a load to 5 requests and serves the last value with its age under a 429 |
| the venue's coordinates and its name | drag the pin to Shenandoah, header still reads "Brew River Dock Bar" |

**Fix.** One source. The second value is derived from it, or it does not
exist.

Not a sync, and not a threshold. Clearing the name when the pin moves works
until somebody adds a second way to move the pin; then it is a rule to
remember rather than a property of the data. `src/core/venueName.ts` stores
the name *with the coordinate it was resolved for*, so reading it means
asking "is this the name of **this** place" and a name for somewhere else is
simply not returned. There is nothing to keep in step.

The same move made the `Aim` union, the `MapPanel` union and `SheetDetent`:
make the disagreeing state unrepresentable rather than unlikely.

---

## B · A check that cannot fail

A check whose passing state and whose could-not-look state are the same
state. It reports green when it saw nothing at all.

**Instances**

| the check | why it could not fail |
|---|---|
| the reachability audit | printed `TIMED OUT`, which matched no pattern in the hook's grep, so the hook refused the commit with one red line and no reason |
| the panel audit | passed because nested panels never opened, so it compared zero panels against zero panels |
| the ray assertion | required the ray to leave the frame *and* to be 0.28 of the diagonal — a 260px ray from a centred pin must leave a 390px-wide frame for any bearing within 49° of horizontal, so the two clauses could not both hold |
| the colour test | read `tokens.css` through a Vite import, which **vitest resolves to an empty string**; every lookup returned null and nine tests went red reporting `expected null to be #2dd4bf`, which reads exactly like a broken palette |
| the label audit | armed placement with `.peek__go` after that button moved, so every canvas tap landed on an unarmed map and there was nothing to measure |

**Fix.** A check must distinguish *broken* from *I could not look*, and must
fail on the second.

In practice that means three things:

- **Assert the precondition.** "0 problems across 0 positions" is not a pass.
  Count what you examined and fail when the count is zero.
- **Exit non-zero with the reason, in words the caller greps for.** `guardAudit`
  and `startWatchdog` in `scripts/preflight.mjs` exist for exactly this.
- **Never let two assertions sit side by side without checking they can both
  hold.** Work the arithmetic, not the intent.

---

## C · A check pointed at the wrong object

The check ran, the measurement was real, and it was a measurement of
something else. This is the worst of the three: it does not fail to look, it
looks at the wrong thing and reports with full confidence.

**Instances**

| what it reported | what it was actually looking at |
|---|---|
| the projection audit's ray fractions | a bundle built nine minutes earlier, before the fix existed — and a `git stash` comparison measured that *same* stale bundle twice, so identical numbers were read as proof the older commit was already broken |
| the cover frame | the landing page, while every programmatic click landed correctly on the map underneath; the counts were right and the pixels were of a different screen |
| the Shenandoah skyline | read from the probe, which takes an explicit coordinate, while the app sat on the calibration venue in coastal Maryland; the guard checked the probe's coordinate rather than the app's venue, so it passed while the chart drew Maryland |
| the horizon profile | tiles that had not finished loading: `−0.73 to +1.18°` where the settled skyline is `−0.99 to +16.5°`. Nothing looked broken. The chart drew a plausible, flat, wrong horizon |
| the sheet audit, 28 Oct | the tab the previous script left behind. A long run of synthetic pinches had wedged that tab's touch input (every dispatch succeeded, no touch event arrived, a mouse click still did), so 13 of 20 drags "moved the wrong thing" in a build where a fresh tab showed none. `connect()` in `scripts/cdp.mjs` now opens a tab of its own and closes it |
| the gesture audit, 29 Oct | a headless Chrome that had run for hours: it hung mid-flick on one run and dropped the connection on another, and Node exited on an unsettled await with no reason printed. A fresh browser passed the same code clean. The gate now starts its own headless Chrome every time, and `scripts/cdp.mjs` fails loudly when the connection drops |
| the commit gate, on e1f3959 | the files on disk, not the files in the commit. A `git stash` taken mid-run came back to the working tree but not to the index; every check passed against the disk, and origin/main did not build for an hour until 052b5f2 added the four missing files |
| every sheet audit, until 29 Oct | a browser tab, where both safe-area insets are zero. From the home-screen icon the iPhone gives 47 px at the top and 34 at the bottom, and there Layers had a band of sheet over the grid at half and nothing but black at the bottom detent, while every audit, Chromium with 0 px insets, passed. `scripts/audit-standalone.mjs` runs WebKit with the standalone insets |
| the pinch audits, 28-29 Oct | a browser that never fires `visualViewport` resize during a pinch. iOS does, and the map's `resize()` called MapLibre's `stop()`, which ends the touch handlers: the map froze for the rest of the pinch and jumped on the next touch. Every emulated pinch passed and the phone still snapped. `scripts/audit-gestures.mjs` now fires the resize halfway through a pinch, and Settings › Debug touch logs what the phone does |
| the build check, until 29 Oct | a page that was loaded, never one that was resumed. The home-screen app is resumed far more than it is launched; the one check made on coming back failed while the radio woke, said 'unknown', and nothing asked again for fifteen minutes, so the icon stayed on the old build while a private tab had the fix. `scripts/audit-sw-update.mjs` now resumes a WebKit page with the server down for the first check and requires the pill once the signal returns |
| the sky fire audit's cloud chip, 30 Oct | Open-Meteo's answer to this machine, not the app: the venue's own forecast was the one request the audit left to the network, and after a night of runs the service refused it ("Daily API request limit exceeded"), so the chip said no data and the gate failed on a commit that had not touched it. That request is a fixture now too |
| the venue pack audit, first run 29 Oct | the real Esri tiles, not the fixture: in WebKit every request of a page a service worker controls goes past Playwright's routes, even the ones the worker passes through untouched. The pack "saved" 42.9 MB of real imagery and only 30 fixture tiles were asked for. Caught because the audit counts the fixture's answers and requires over 3000; `scripts/audit-venue-pack.mjs` now saves with service workers blocked and installs the worker in a second sitting on the same profile |
| the 3D clouds, until 29 Oct | Chrome, which hands a canvas's pixels back as drawn. WebKit's fingerprinting protection adds noise to pixels read back from a 2D canvas, and the cloud sprite was a canvas the engine read into its texture: rainbow speckle on an iPhone, and in Playwright's WebKit, while every Chrome frame was clean. The sprite is an SVG image now. The terrain decoder, read through a canvas too, was the next suspect: measured in WebKit on 29 Oct, the noise lands on pixels script drew (text, gradients) and not on an image drawn onto the canvas, so the old path read every elevation byte exactly. It reads the PNG's bytes now anyway (src/lib/png.ts), so no browser's noise policy can reach a height; `scripts/audit-terrain-decode.mjs` |

**Fix.** A check asserts the **identity** of what it measured, not only the
value.

- **Counts are not pictures.** `window.__probe` saying there are two cones
  proves the map *state*; it says nothing about what is on the glass. Look at
  the frame.
- **Date what you measured.** `servedAppFreshness()` in `scripts/preflight.mjs`
  refuses to measure a bundle older than the newest watched source file, and
  names the file and the gap in seconds.
- **Assert the object, not a proxy for it.** Check the app's venue, not the
  coordinate the script happens to hold.
- **Wait for the real signal.** `idle` means the tiles have arrived; a timer
  means a timer elapsed.

### The gate built the disk, not the commit

`.githooks/pre-commit` runs in the working directory. Everything it checks is
whatever is on disk at that moment, which is the commit *plus* every untracked
and unstaged file. A commit that leaves out a file it imports passes, because
the file is right there beside it.

**Fix: `.githooks/pre-push`.** For every ref being pushed it checks out exactly
that commit into a new, empty worktree, asserts the worktree is at that sha and
clean, installs from the lockfile, and runs `tsc -b`, the build and the tests
there. It refuses the push otherwise. Replayed against e1f3959 it fails on
`src/three/clayScene.ts: no exported member 'buildSea'`, which is the error
origin had.

And no `git stash` during a run. A stash is a second copy of the work with its
own idea of what is staged, which is shape A as well as C.

### A guard that names what it does not want is disarmed by a rename

The `.land` guard, written to stop the frame script photographing the cover
page, passed silently when the cover pass renamed `.land` to `.cover`. It
spent two passes checking for an element that could not be on the page, and a
cover-page screenshot went through underneath it.

A negative guard has a dependency nobody records: every name it excludes.
Rename any of them and the guard still runs, still passes, and guards nothing.

**Fix: assert a positive property of the object you DO want.** "The map canvas
is visible and covers more than 60% of the viewport" survives any rename
elsewhere in the tree, because it describes the thing being measured rather
than the things that might be in the way.

---

## D · A feature that hides its own dependency

A feature that covers, disables or otherwise blocks the control it needs to
work. The user is told what is missing and cannot get to it.

**Instances**

| the feature | the dependency it hid |
|---|---|
| the drone chip | derived its enabled state from the selection it exists to change, so it could not be used to make itself usable |
| the elevation curve | needed terrain, terrain is in Layers, Layers is in the sheet, and the curve took the whole sheet — then printed "no elevation data here" |

The second one went further: the chart's drag handler also swallowed the
sheet's detent gesture, so at HALF there was no way to move the sheet, no
controls on screen, and no way out at all.

**Fix.** A message that names a missing capability carries the control that
supplies it. Not a pointer to where the control lives — the control.

`SunCurve`'s "no elevation data here" is a button that turns terrain on in
place. It does not flip the toggle by itself: the tap is the user's, because
terrain costs frames on a phone and they turned it off for a reason.

The surface audit now checks both halves of this: every detent must be
**reachable by drag** from every other, and every message naming a missing
capability must have a control beside it.

---

## The thread

A, B and C are the same mistake at different distances: **believing a value
without establishing what produced it.**

A reads two values and does not ask which is authoritative. B reads a result
and does not ask whether anything was examined. C reads a number and does not
ask what it is a number *about*.

D is a different mistake and worth keeping separate: not believing a wrong
value, but leaving the user somewhere they cannot act. Its test is not "is
this true" but "can they do anything about it from here".

The fix for the first three is to make the provenance part of the value — the key
beside the name, the count beside the verdict, the build date beside the
measurement — so that a value with no provenance cannot be mistaken for one
that has it.
