# Batch CORE · Sun 15 Nov (from phone tests 14–15 Nov)

## Rules
Same as LIVE:
- One commit per section, full gate, push after each.
- **Two strikes and the section is reverted.** Gate-audit failures caused by your own change count as strikes. The gesture audit is a known flake: re-run it alone before counting it.
- Load ≤ 12; hard stop at 8 h.
- Contact sheets at 390×844, 390×664 and 412×915.
- Model proposes, code computes. Facts only, never "safe" or "clear".
- Nothing about the user leaves the phone.

Before starting, paste LIVE's final per-section status into `docs/batches/live-status.md`. Anything LIVE left undone that is listed below is done here; don't redo what LIVE finished.

## Field truth fixtures (fixtures/truth/)
- **`2026-11-15-vb-sunset.json`: FIRE.**
  - Jwilly photo, inland VB, about 5:00–5:10 PM. A whole-sky altocumulus/stratocumulus deck lit vivid red-pink from horizon to overhead, with a lit gap at the WSW horizon.
  - The app at 4:59 PM:
    - Sky Now said "Worth a look · One thing in the sky now", "Partly cloudy under 20,000 ft (forecast) · no station report in the last 75 minutes".
    - **Next = "Sunrise 6:43 AM · Color possible"**. It had already skipped tonight while the color was peaking.
    - The tabs had already switched to "Tomorrow morning · Tomorrow evening".
    - No Go/Fire alert.
  - Truth = Fire. Biggest miss so far.
- **`2026-11-14-vb-sunset.json`** (from LIVE S10): inland, good color toward WSW. App said Little.

## SECTION 0 · Know what's on the phone
1. **Build stamp.** Show the short commit hash and build time at the bottom of "How we got this" and in Settings.
   - The 15 Nov phone still showed "no station report in the last 75 minutes", which 60bb388 was supposed to fix. Find out whether Vercel served an old build, the service worker cached it, or the fix doesn't work on device. Report which.
2. **Service worker.** A new deploy must take over within one reload: skipWaiting + clientsClaim, and a "New version · Reload" chip. Test it with two builds in Playwright.
3. **Vercel function privacy check.** The deploy is scoutngo.vercel.app. Confirm the API pass-through function logs nothing: no request bodies, no coordinates, no IPs in our code. Document what Vercel itself keeps by default and how it's turned off or minimized in `docs/privacy-hosting.md`.

4. **Sources and licenses audit → `docs/sources-licenses.md`.** One row per outside thing the app touches (APIs, tiles, imagery, cams, links), with: what we use · license/terms · attribution required · key needed · rate limit · status (ok / fix / remove). Then fix:
   - **Attribution:** an "Data & credits" page (linked from How we got this and the landing footer) plus the required on-map credits (OSM ©, Esri, NASA GIBS, NOAA/NWS/NDBC, Open-Meteo CC BY 4.0, ECMWF if used).
   - **Esri imagery:** confirm whether our tile URL needs an ArcGIS Location Platform key and "Powered by Esri" credit. If a key is needed, add one (free tier) or switch to a source that doesn't need it.
   - **Open-Meteo:** we're inside the free non-commercial terms (no ads, no subscriptions). Make sure calls go **from the phone**, not through the Vercel function, so the per-IP limits don't stack on one server.
   - **Third-party surf sites (Surfline, Surfchex, etc.):** links that open their page in a new tab are fine. **No** embedding or framing of their cams or pages, no scraping, no copying their numbers into the app, and no logos. Remove anything that does that, and report it.
   - **Cams:** list every cam we show. Embed only ones whose owner allows it (public city/state/NOAA cams, or written permission); otherwise turn them into plain links.
   - **Fixtures:** the occasional manual "Surfline said Flat" note in a truth fixture is OK. Never fetch it automatically.
   - **Safety wording:** the airspace and drone screens say "Not an official FAA source · check B4UFLY/LAANC before you fly". The surf, wind and tide screens say "Forecasts can be wrong · look before you go in".
   - **LICENSE:** confirm the repo has one (MIT or Apache-2.0), with its no-warranty clause, and that no keys are in the repo or its history.

## SECTION 1 · The sunset call (carried from LIVE S10, plus 15 Nov)
1. **10.1: one sky-call object per spot per event.** The home card, pill, Sky Now "Next", the Sky Tonight/Now tabs, Best Sky "Where you are", the alerts and the hourly strip icon all read it.
   - Test: on every fixture, no two surfaces disagree on the word, the direction or the window.
2. **10.3: observed clouds beat models inside T-90 min.**
   - When the station or satellite shows SCT/BKN/OVC mid or low cloud, rescore the sunward side with the observed deck: lit undersides plus a horizon gap, read from the satellite **upstream** (wind at cloud height × time to sunset).
   - Fixtures:
     - 14 Nov inland must score ≥ Possible toward WSW.
     - **15 Nov must score Likely or Fire at T-60 and T-30.**
     - Report the call at T-3 h, T-60 and T-30 for both days.
3. **The event lasts until the color is over.** Sky Now, the tabs and "Next" stay on tonight's sunset until the end of the color window (sunset + about 20 min, or dark), never flipping to tomorrow at sunset.
   - During the window the Now headline is the event itself: "Color now · whole sky · look W then overhead".
4. **Go alert.** When the call reaches Likely or Fire inside T-45, fire the local notification ("Go now · color likely · 4:44–5:10 · look WSW"). Local only, opt-in, nothing leaves the phone.
   - Check why no alert fired on 15 Nov, and whether "Go now" from older builds still exists.
5. **Fast cloud days** (14 Nov 3:42 note): when cloud rows move at 20+ kt, the sky word shows a range, "Clouds coming and going · 30–70%", not a flip.
6. **Station-vs-model warning:** add the trend ("deck moving SE · clearing here by ~3:30"). Never hold a 40-min-old point report against a moving deck.
7. **10.4:** the "why" lines come from the same cloud state, including the station deck.

## SECTION 2 · 3D and drone Fly (broken on iPhone)
1. **3D:** opening 3D glitches and dumps back to the home screen (15 Nov).
   - Most likely the iOS tab reloading after a WebGL context loss or memory kill. Check `webglcontextlost`, the texture sizes, the DPR (cap at 2) and the tile cache limits.
   - Reproduce with Playwright WebKit at 390×844 plus a memory cap.
   - Fix: on context loss, stay on the map and show "3D didn't load · Back to 2D". Never reload the app.
   - Keep the LIVE S5 10 s timeout.
2. **Drone Fly fails** every time (14 Nov 11:47 PM).
   - Reproduce from the drone card at Near you and at a beach spot. Report the console error and the commit that caused it. If LIVE S6 caused it, fix it or revert S6 only.
   - Fly must open within 3 s or show "Fly didn't load · Back".
3. **Error boundary per screen.** A crash in 3D, Fly, the planner or the map shows a "didn't load · Back" card on that screen. It never resets the app to home.
4. **Contact sheets:** 3D open and orbiting, Fly mid-flight, and the failure cards.

## SECTION 3 · Tide and map failures
1. **Tide page blank.** 15 Nov 5:22 PM on 5G: "Could not reach NOAA for tide predictions, and none is saved for this date". Yet the map strip showed "Low 5:52p" at the same time.
   - The Tide page must use the same tide source and cache as the strip and the home card.
   - Prefetch 7 days of predictions on every successful fetch, and retry with backoff.
   - Never show an empty page; show the saved curve with its age.
2. **Two different lows.** The map said "Low 5:52p" and the home said "Low 9:15 PM", 25 min apart. One tide function and one station for a spot; report which was right against NOAA CO-OPS for VB (8638863 or the nearest).
3. **Map blank:** "Map data didn't load · Retry" with nothing drawn (5:41 PM, radar on). Base tiles must still draw when an overlay fails. Find which request failed and report it.
4. **Map time label stale:** at 5:41 it read "at 5:22 PM Sun". Opening the map, and tapping "Now", resets to the current minute.

## SECTION 4 · Home cards
1. **Sky word consensus (S0.2 check):** at 5:46, home said "Overcast" while the map said "Mostly cloudy". One function.
2. **Surf headline vs chart (10.9):** "1–2 ft Small" while the chart line sat at about 0.3 ft. Same for 14 Nov ("2–3 Rideable" vs 0.5 ft). Report which path made each number and fix it. Add fixtures.
3. **Tide card:** no curve drawn, and "1.9 ft now" overlaps "low 9:15 PM" with a lone "1" axis label. Restore the curve and run the overlap audit.
4. **Drone card:** "Breezy" overlaps "● 14 kt now" and the chart is missing. Restore it and run the overlap audit.
5. **Hourly strip:** "Now 50°" while the headline said 47°. Both come from the same reading.
6. **Live sky at night:** the moon is clipped under the URL bar at top right. Keep it inside the safe area. Under Overcast, dim it or hide it; don't show it crisp.

## SECTION 5 · Sky page (LIVE S2 leftovers)
1. The Now headline names the thing; no generic "Worth a look · One thing in the sky now".
2. Remove the stray bullet.
3. **Rare light:**
   - Light rays need sun ≤ 15° (Mon 3 PM at 18° still showed).
   - At most 3, ranked. "+3 more" means 6 qualified, which is too many.
   - Fixture: the 15 Nov week list ≤ 3.
4. Confirm the Sun / Moon / Night rebuild shipped. If not, build it from the approved boards.

## SECTION 6 · Landing and first run
1. **Landing: build Landing_E** (docs/mockups/Landing_E.png, Jwilly's pick). It replaces the current "Four apps in one" page.
   - Layout from A: the "Know before you go outside." headline, the sunset gradient, and a list card with icon rows.
   - Rows: Surf · Shoot · Drone · Tide · Wind, with example values.
   - Under the list, the gradient "Where's the color tonight?" card from B. It opens the Best Sky flow after the first run.
   - **No Fish or Weather row on the landing** (decided 16 Nov). Fishing stays in the app as it is.
   - **Wording rules (Jwilly, 16 Nov):**
     - Never say "no account" anywhere: landing, footer, first run, about. Say "Free and open source. Your spots stay on your phone."
     - **No mention of the drone Fly / "fly it here first" sim** on the landing until it works. The Drone row is wind up high + airspace only.
     - Footer: "Free · open source · Privacy". Add "works offline" back **only** after Section 7A passes.
2. **No Virginia Beach on the landing.** No real place name at all; the landing can't know where the visitor is and must not ask.
   - Use clearly illustrative values labelled "Example".
   - Remove "At the Virginia Beach Fishing Pier, as an example" and "Moon rises off the pier end".
3. **Moonrise check:** the landing said "Moon rises … Tue 11:39 PM" while the moon is waxing (33%, rising late morning). Run every moon time through the second-ephemeris check and fix whatever made it.
4. **Stray dash** under "Sky color · Reads the clouds 400 km toward the sun": remove it.
5. **First run:**
   - The "Where do you go?" page has a big empty area. Add a few nearby-type examples ("Beach · Park · Lake") as chips, or shrink it.
   - The "What do you do outside?" picker is fine.

## SECTION 7A · Offline and weak signal (Jwilly: still has issues offline and in the car off Wi-Fi)
1. **Reproduce first.** In a Playwright WebKit test with three network profiles, open home, Sky, Tide, Surf, Weather, the map and Best Sky for a saved spot and for Near you:
   - **offline**;
   - **car**: 400 kbps, 400 ms RTT, with 10% of requests dropping;
   - **switch**: Wi-Fi → offline → cellular mid-load.

   Record what breaks per screen in `docs/batches/offline-walk.md`. The 15 Nov blank Tide page on 5G is probably this.
2. **App shell:** the service worker precaches every route, font, icon and code chunk, so the app opens in airplane mode, including 3D and Fly showing their "needs signal" card instead of a blank screen.
3. **Data:**
   - Every fetch is network-first with a **4 s timeout**, then falls back to the last saved copy.
   - Show the age on the card ("from 2:10 PM · 3 h ago").
   - Never a blank page, never "Could not reach X" with nothing under it.
4. **Saved ahead:** on each good fetch, keep 7 days of tides, 48 h of hourly forecast, sun/moon times (computed in code, no fetch needed), and the last surf/wind/sky call for Near you + every saved spot + the last 5 viewed. All of it is stored on the phone only, in IndexedDB, capped at 25 MB with the oldest dropped first.
5. **Map offline:** keep the last-viewed area's base tiles at z8–z14 and the last radar/cloud frame (labelled with its time). With no tiles, show the spot dot and the sun/moon lines on a plain chart background, never a blank blue screen.
6. **Signal chip:** one small "Offline · showing 3:10 PM" chip at the top when offline or when data is older than 30 min. Tap it to retry. No error banners stacking.
7. **Retry:** on getting a signal back (`online` event, visibility change, or every 60 s while open), refresh quietly, without a reload or scroll jump.
8. **Gate:** add `audit:offline`, which runs all three profiles and fails on any blank screen, NaN/"—", uncaught error or spinner over 10 s.

## SECTION 7 · Check everything
1. **Live phone pass.** A Playwright WebKit walk at 390×844 against the **deployed** URL with live data:
   - Landing → first run → home (all 3 swipe pages) → menu (each card) → Sky (Now / Tonight / Tomorrow) → Best Sky (3 pages) → Sun / Moon / Night → Calendar → Weather → Surf / Tide / Wind / Buoys → map (radar, wind, clouds; z12, z7, z4, z2; playback) → planner → 3D → drone Fly → field report.
   - Flag any blank page, "didn't load", NaN, "—", overlapping text, a value disagreeing between two screens, or a console error.
   - Output `docs/batches/core-walk.md` as a table: screen · problem · fixed in this batch (y/n).
2. Fix every problem found that's under 30 min. List the rest for the next batch.

## SECTION 8 · LIVE leftovers (anything LIVE didn't finish)

**8.1 addendum, done first within S8 (Jwilly, 16 Nov 10:52):**

### CORE addendum (paste-in, 16 Nov 10:52): surf OVER-call, the mirror of 14 Nov's under-call
**Truth:**
- Cams at North End, Sandbridge, 1st St and Croatan: small, wind-chopped, knee to thigh.
- Jwilly: "Croatan Jetty only one looks okay, barely rideable."
- Surfline sanity check (manual, not an input): 1–2 ft Poor everywhere, N 10–14 kt cross-shore, spectrum 2.7 ft 5 s NNE 33° + 0.3 ft 11 s E.

**Ours:** "2–3 ft RIDEABLE · knee to waist · bumpy, cross-shore", plus:
- a "clean" band shaded 11a–1p on the chart;
- buoy 44099 3.9 ft 6 s NE → "as faces ≈ 3.3 ft · bigger than forecast";
- the week runs one bin high every day (Mon 2–3, Tue 1–2, Wed 0–1, Sat 1–2, vs 1–2 / 0–1 / Flat / 0–1).

**Cause (likely):** the as-faces step treats a 6 s NNE wind sea almost like groundswell (×0.85). Short-period wind sea arriving 50–60° off the beach normal loses most of its height at an E-facing beach. 14 Nov was the opposite (a hard cutoff to 0). Same root: no proper per-partition transform.

**Fix (do it inside S8.1, one transform for both days):**
1. **Per partition:** split swell vs wind sea (NDBC spectral or model partitions). For each:
   - a direction factor = cos² of the angle off the beach normal, with directional spread, plus a taper to 0 beyond ~100°;
   - a **period factor** for breaking height (short period breaks much smaller than its Hs, about 0.35–0.5 at 5–6 s vs 0.9–1.1 at 11 s+).

   Combine by energy (root-sum-square), not by adding heights.
2. **Per-spot factors:** jetties (Croatan, 1st St) catch N wind sea and shelter from N wind better than the open beach. Seed them from field reports; default 1.0.
3. **Quality words:** no "clean" shading and no "Rideable" when the wind is ≥ 10 kt cross-shore or onshore. Use "Poor · choppy" / "Fair · textured", the same rule as the S0.4 wind-quality bands.
4. **Fixtures (all must pass, one model):**
   - **16 Nov 10:50:** VB 1–2 (not 2–3), Croatan best, quality Poor/choppy, no "clean" band.
   - **14 Nov 1–4 PM:** VB 1–2, Croatan ≥ 1–2.
   - **12 and 13 Nov:** Flat.
5. **Week bias check:** log our 7-day calls; after 14 days, report the mean bin error per day-ahead. Don't tune to Surfline: tune to field reports + cams Jwilly confirms.
6. **"See it yourself":** say "0.2 mi" not "0.0 mi" (distance to the cam, not the anchor). Keep "paid" and the plain link out.

Use `docs/batches/live-status.md` (written at the start from LIVE's final report plus `git log`). For each item below that LIVE did **not** finish or only finished partly, do it here, in this order. Skip what's done; say so in the report.
1. **Surf miss, 14 Nov (LIVE S9):**
   - Replace the >90° wind-sea cliff with a cos² taper plus directional spread.
   - Don't trust 44099 alone for direction (it's at the bay mouth); weigh 44014/44100 and the model spectrum.
   - Cap the nowcast pull when buoys disagree with each other or the model by more than 1 ft.
   - Per-spot jetty factors from field reports.
   - Test: the 14 Nov 1–4 PM replay gives VB 1–2 and Croatan ≥ 1–2; 12 and 13 Nov stay Flat.
2. **Field report (LIVE S9):**
   - A spot chip row (Croatan, 1st St Jetty, Pier, North End, Sandbridge…), defaulting to the nearest.
   - "1 of 3 reports needed to tune this spot".
   - "The photo's time and place fill this in. The photo isn't kept or sent."
   - The app toggle instead of the black checkbox.
3. **Best Sky (LIVE S8):**
   - Labels sit on their pins, with no pin under another pin.
   - The pink wash discriminates: no full inland wash on 5% model low cloud.
   - Page 3 opens on #1.
   - "Why here" is never empty and explains a "Little".
   - The buttons aren't clipped.
   - Sky Tonight header: "sun sets WSW · pink ENE".
   - The layer picture draws the observed station deck.
   - The footer links sit at the end of the scroll, not over the list.
4. **Wind map (LIVE S1):**
   - Every zoom down to world.
   - The crosshair reading is stable between z12 and z2 (±3 kt).
   - No skew or rotation.
   - The playback scrubber shows day + time.
   - Banners are hidden in wind mode and tied to the place on screen.
   - `audit:wind-live`.
5. **Calendar + week (LIVE S3):**
   - Forecast icons only within 7 days.
   - Past days from truth.
   - Real toggles and a full day card.
   - "See the month ›" on the week page.
   - Week rows are even, and the "Best this week" line matches the pills.
6. **Menu A + chart labels (LIVE S4):** Menu_Pop with live art; the pixel-overlap audit on every home chart, including the drone chart.
7. **Planner card (LIVE S5):**
   - One simple card, with actions behind "…".
   - Feet for US users.
   - No horizontal scroll at 390.
8. **Live sky backgrounds (LIVE S7):** confirm the 8-state contact sheet exists and send it to Jwilly for approval. Keep it home-only until he approves.

If time runs short, stop after 8.3 and list the rest. Sections 0–7 come first.

## Not in this batch
- **Fishing "best time":** parked (16 Nov). Later: tide turns ± 1 h, solunar major/minor periods, pressure trend, and water temp, computed in code. Not now.
- **Parked ideas (not now):**
  - From Windy: an observed-vs-forecast station layer, a satellite loop, a drone airgram, a predictability %.
  - From Atlas: a spot list from Wikimedia Commons geotags, and "settings that worked" from your own EXIF on the phone.
  - The IG "prediction vs shot" reels.
- **Grey-day colors:** replaced by live sky (LIVE S7). Report whether S7's 8-state contact sheet exists; Jwilly still needs to approve it.

## FINAL REPORT (short bullets)
- Per section: the commit and its contact sheets.
- Section 0: why the old build was on the phone.
- Section 1: the 14 and 15 Nov calls at T-3 h / T-60 / T-30, before → after.
- Section 2: the cause of the 3D reload and the cause of the Fly failure.
- Section 3: which low tide was right.
- Section 8: which LIVE items were already done vs done here vs still open.
- Section 7A: the offline walk before → after, per screen and profile.
- Section 7: the walk table path, and the count found vs fixed.
- Anything left undone.
