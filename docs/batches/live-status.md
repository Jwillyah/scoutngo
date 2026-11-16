# Batch LIVE · final per-section status (14 Nov, written 16 Nov from the LIVE report + git log)

| Section | Commit | Status |
|---|---|---|
| 0 · Data truth first | — | **Reverted** (two strikes: tsc on its own test, then the sky fire audit). Patch kept at `docs/batches/live-section0-reverted.patch`. None of 0.1–0.7 shipped in LIVE, except 0.1's Sky Now/Tonight station split, fixed later in S10 (60bb388). |
| 1 · Wind map | 4ac5548 | Done: MAX_LAT 85 and longitude wrap, point wind at the crosshair, north and pitch locked, playback "Sat 3 PM", banners off-screen distance, `audit:wind-live`, tests. |
| 2 · Sky pages | — | **Reverted** (two strikes: the safari tab audit selector, then tsc packaging). Patch at `docs/batches/live-section2-reverted.patch`. Not shipped: the Now headline, the Now side view, rare light limits, the layout, the Sun · Moon · Night rebuild. |
| 3 · Calendar and week | 85d34a2 | Done: forecast icons within 7 days, guesses marked "?", past days, real chip toggles, full day card, "See the month ›", one word a day on the week. |
| 4 · Menu A and charts | 286aace | Done: Menu A art, value bubbles kept off lines (drone chart included), home-fit and menu audits. |
| 5 · Planner and 3D | b3398a5 | Done: one simple card with "…" and "i", feet first, no horizontal scroll; 3D 10 s load timeout and "3D didn't load · Back to 2D". |
| 6 · Drone Fly | c2c8c30 | Done: one-row Land · Keep flying, airspace chip after 5 s, battery on one line, soft animated ground, sine-free sky hashes, Real while online. |
| 7 · Live sky | ea8ea39 | Done behind a flag (home only). 8-state contact sheets made (iOS tab and Android tab, home/Sky/Weather); **not yet approved by Jwilly**. |
| 8 · Best Sky pins and pink (paste-in) | 58008e0 | Done: pins spread, labels attached, pink only on observed cloud, station tags, "Little" says why, header "sun sets X · pink Y", station deck in the picture, footer at the end of the scroll. Not done: page 3 opening on #1 (not verified). |
| 9 · Surf nowcast and field report (paste-in) | 82cc8ae | Done: cos² taper with spread, 44099 at half weight, pull cap on disagreement, per-spot beach factor, spot chips, toggle, wording, re-tagged 14 Nov report, before/after measurement. |
| 10 · One sky call (paste-in) | 60bb388, a9b98ad | Partly done: pill timing (call's own colour window), Sky Now uses the station Tonight uses (METAR time), Best Sky line under a station deck, why lines consistent when blocked, rare light cap 3 + 10 s timeout. **Not done:** 10.1 one sky-call object, 10.3 observed clouds over models inside T-90, 10.4 station deck in the why lines, 10.8 pin-collision fixture, 10.9 surf headline path. |

Fly after LIVE: the 14 Nov 11:47 PM iPhone failure did not reproduce on the Mac (headless WebKit, and headed WebKit on the Apple GPU) at Near you, Croatan and the pier; no console errors. Bisect skipped (Jwilly, 16 Nov).
