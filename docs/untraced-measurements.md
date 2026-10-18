# Untraced measured claims

Every line in the tree that says **MEASURED** without naming the file the run
wrote. `scripts/audit-measurements.mjs` reads this file as a ratchet: these
are known, a **new** one fails the commit gate, and an entry here that no
longer matches anything in the tree also fails, so the list cannot rot.

Nothing here has been deleted, reworded or backfilled. Each needs a decision:
**re-measure** (do the run, write the file, cite it), or **reword** (the word
is doing prose duty and should go), or **delete**.

---

## 1 · Real numeric claims with no file behind them

These quote numbers that came out of an actual run. They are the ones that
matter: a reader cannot check any of them, and I cannot prove from the repo
that the run happened.

- `src/components/MapView.tsx:2407` — **the fps table.** `17.2 fps` terrain
  off / `3.2 fps` on, heap `42 MB` / `78 MB`, at z16, pitch 60, 4× CPU
  throttle, rotating continuously. This is the one real figure from item 1,
  and the comment already admits idle and gesture are unmeasured on both
  profiles. No file; the run was never written down.
- `src/core/capture.ts:40` — **the 2532 vs 1568 capture A/B.** Three generates
  per arm, interleaved, at the calibration venue on 2026-09-17: model leg
  `2532: mean 11622ms`, `1568: mean 11795ms`. A real interleaved experiment
  with no artefact.
- `src/core/goes.test.ts:90` — **the GOES legibility table.** Virginia Beach,
  36.85 N, 390 px screen, screen pixels per satellite pixel across zoom 7–13
  with the scale bar at each. Looks like a careful sit-down with the app.
- `src/components/weatherPanel.test.tsx:8` — **the Lynnhaven Inlet wind
  profile.** 07:00 on 15 October 2026 from Open-Meteo: ground `2.08` m/s,
  180 m `7.50` m/s, 22 degrees apart. This is the observation the whole panel
  was built for and it exists only in a test comment.
- `src/core/sunBand.test.ts:158` — **the Lesner Bridge window.** 20 Oct 2026,
  sunrise 07:15 local, the stretch that used to read "nothing to light a
  position with".
- `src/core/shotType.ts:76` — **meridian convergence**, "measured here at 6e-5
  degrees over 400 m at this latitude". A real number from a real check.
- `src/core/sunSky.ts:118` — **MapLibre's camera convention**, "MEASURED
  RATHER THAN GUESSED": principal point at the padded box centre, focal length
  from the full canvas height. The comment says it was got wrong twice before
  this, which is exactly the kind of finding that should have an artefact.

## 2 · The word is doing prose duty

No run behind these. "Measured" here means *computed from data* or *read from
the DOM at runtime*, which is a different claim and arguably should use a
different word so the marker keeps its meaning.

- `src/components/MapView.tsx:1597` — "a MEASURED SEPARATION": the pilot
  distance, computed in core.
- `src/components/MapView.tsx:2284` — "A MEASURED HEIGHT AND A NOMINAL ONE":
  OSM-tagged height versus an assumed one. A domain term, not a run.
- `src/components/MapView.tsx:2320` — "THE MEASURED/NOMINAL DISTINCTION":
  same term, about where it is encoded.
- `src/lib/buildings.ts:114` — "WHETHER THE HEIGHT IS MEASURED": same again.
- `src/components/PlanMode.tsx:430` — "the dock height is MEASURED rather than
  assembled from per-bar tokens": measured from the live DOM at runtime.
- `src/components/PlanMode.tsx:638` — "MEASURED, not guessed": same, the row
  height.
- `src/components/PositionCard.tsx:544` — "THE PILOT SEPARATION, MEASURED IN
  CORE": computed.
- `src/components/planChrome.test.tsx:342` — "THE MEASURED MULTIPLE": the
  frame-to-subject ratio, computed.
- `src/lib/groundViewAim.ts:44` — "THE MEASURED BEARING WINS": the forward
  azimuth already computed elsewhere.
- `src/lib/plan.test.ts:56` — "The MEASURED forward azimuth": same.
- `src/core/captureTerrain.ts:4` — "MEASURED, NOT ASSUMED": prose about the
  method, though the 57 px figure it leads to is a real measurement and is
  cited nowhere.
- `src/core/capture.ts:8` — "to be MEASURED at a real venue, not guessed": an
  instruction to a future reader, not a claim.
- `scripts/audit-labels.mjs:215` — "SO THE WARNING WORDS EXIST TO BE
  MEASURED": prose about the fixture.
- `scripts/audit-projection.mjs:186` — "still MEASURED and printed": prose
  about `endsInFrame`.

## 3 · A false positive of the current matcher

- `src/core/exposure.ts:135` — "A TABLE OF STARTING POINTS. **NOT MEASURED**,
  NOT COMPUTED, NOT A PROMISE." The line exists precisely to deny that these
  are measured, and the audit flags it for containing the word. Left in rather
  than special-cased: a matcher that quietly skipped negations would be one
  more rule nobody can see, and the honest fix is probably to change the
  wording here rather than the matcher.
