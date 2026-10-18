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
