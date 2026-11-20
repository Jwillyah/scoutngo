# Batch DRONE + MAP · Mon 16 Nov (after CORE efbaa6e)

## Rules
Same as CORE:
- One commit per section, full gate, push after each.
- **Two strikes and the section is reverted.** Gate-audit failures caused by your own change count as strikes; gesture and service-worker are known flakes, so re-run them alone before counting.
- Load ≤ 12; hard stop at 8 h.
- Contact sheets at 390×844, 390×664 and 412×915.
- Model proposes, code computes. Facts only, never "safe" or "clear".
- Nothing about the user leaves the phone.

**New rule for this batch:** Section 0 is split into small pieces, **one commit each**, so one failure doesn't revert the rest. If a piece strikes twice, revert only that piece and move on.

Mockups are in `docs/mockups/`:
- SkySun, SkyMoon, SkyB2n, D_Sky
- Drone_P1 … P4, Drone_Layers
- Map_Timeline_Wind, Map_Timeline_Tide, Wind_Bar_7
- About_Story

## SECTION 0 · Redo CORE Section 0 in pieces (patch: docs/batches/core-section0-reverted.patch)
Re-apply from the patch, one commit per item, in this order. Find what caused the two CORE strikes (reachability, then wind) before re-adding anything that touches them.
1. **Station fix (top priority).** When weather.gov's newest report is older than 75 min, also ask the METAR source (aviationweather.gov) and keep the newer one.
   - Show "KNTU 1:56 PM" with its source.
   - Fixture: 16 Nov 14:47Z (weather.gov 12:56Z vs AWC 13:56Z) → uses 13:56Z.
2. Build stamp (hash + build time in "How we got this" and Settings).
3. Safety lines (FAA line on the drone/airspace screens; "Forecasts can be wrong · look before you go in" on surf/wind/tide).
4. Data & credits page + `docs/sources-licenses.md` + LICENSE check.
5. Open-Meteo asked from the phone first (not through the Vercel function).
6. `docs/privacy-hosting.md` (Vercel runtime logs: what's kept by default, and that our function logs nothing).

## SECTION 1 · Surf transform (CORE 8.1, the real fix)
CORE pinned the source: the buoy "as faces" step turns 44099's 1.2 m, 6 s NE wind sea into about 3.3 ft. A period factor alone fixes 16 Nov but breaks 14 Nov, so **recalibrate the model path and the buoy lean together**:
1. **Per partition** (swell vs wind sea):
   - direction factor cos² off the beach normal, with spread, tapering to 0 past ~100°;
   - period factor (about 0.35–0.5 at 5–6 s, 0.9–1.1 at 11 s+);
   - combine by energy.
2. **Buoy lean:** blend the buoy into the model only after the buoy goes through the **same** transform, and cap the lean at ±1 ft when buoys disagree with each other or the model.
3. **Per-spot factors** for the jetties (Croatan, 1st St), seeded from field reports.
4. **Quality words:** no "clean" band and no "Rideable" with wind ≥ 10 kt cross-shore or onshore → "Poor · choppy" / "Fair · textured".
5. **One model must pass all four days:**
   - 12 and 13 Nov: Flat.
   - 14 Nov 1–4 PM: VB 1–2, Croatan ≥ 1–2.
   - 16 Nov 10:50: VB 1–2, Croatan best, Poor/choppy.

   Report a before → after table per day.
6. **One surf series everywhere.** The map crosshair said "swell 1.6 ft 4 s" while the Surf page said 0.7 ft 12 s (16 Nov 11:02). Same source and same hour.
7. **Week bias log:** keep our 7-day calls on the phone; after 14 days, show the mean bin error per day-ahead in "How we got this".

## SECTION 2 · Drone, 4 swipe pages (Drone_P1–P4, Drone_Layers)
Pill tabs **Now · By height · Airspace · Plan**, using the same pill component as the Sky page. Swipe between them. Drone opens on **Now**; the airspace card jumps to Airspace.
1. **Now (P1):**
   - wind at 400 ft with direction + gusts ("15 kt from NNW · gusts 22");
   - "under your 23 kt limit · gusts at 96%";
   - a compass arrow pointing where it blows;
   - the "Gusty now · calmer 3–4:50 PM" chip;
   - today's bars at 400 ft against the limit, **daylight + civil twilight only**, with sunset and twilight marked;
   - 4 cards:
     - Airspace: class, ceiling, facility, "Check TFRs ›";
     - Battery: rated minutes trimmed for cold, with the temperature;
     - Sky: cloud base, visibility, rain %;
     - GPS Kp: value + age, never "—".
2. **By height (P2):** a grid of altitude (gnd/100/200/300/400 ft) × hour, colored under 15 / 15–22 / at the limit, with the LAANC ceiling line and a sunset marker. The headline is the best window.
3. **Airspace (P3):** map-first.
   - The search "Where do you want to fly?".
   - FAA layers: UAS Facility Map grids with max heights, class airspace, TFRs (live feed), special use airspace, National Security UAS restrictions, FRIAs, NASR heliports, NPS/state/local parks.
   - A bottom sheet for the marker point: "Class D · max 250 ft here", the facility, chips (TFRs today · nearest heliport · Remote ID · sunset), "Get LAANC in an FAA app ›" (link out; we never issue LAANC), and "Save spot" (on the phone).
   - A layers sheet (Drone_Layers) with toggles + base map (Chart / Satellite / 3D) + weather layers.
   - All data is fetched and cached on the phone, and works offline from the cache with its date.
4. **Plan (P4):**
   - **Turn back by:** battery % given the distance and direction out and the headwind home, including the cold trim. Computed in code; show the inputs.
   - **Sun at 400 ft:** sunset time at altitude vs the ground (geometric dip), "2 min after the beach".
   - **Sun in the lens:** the bearing range to avoid for flare after a given time.
   - **Lens fog / icing** from dew-point spread and temp.
   - **Birds:** only if a free public source exists (BirdCast migration forecast). Otherwise hide the card; never make it up.
   - **Your last flight here (opt-in, phone only):** import a DJI flight log from Files and show the duration, max height and the wind the drone felt vs our forecast. Never upload it.
5. **Fix:** the Fly pilot figure is placed at the takeoff point (Clay3D.tsx:459). Move it 4 m behind takeoff and hide it while the drone is within 10 m. "Fly it yourself" stays off the landing; on the drone page it's "Plan the flight".
6. **3D memory:** the near ground canvas is 4096² (~64 MiB + GPU). On iOS, cap it at 2048² and the DPR at 2. Test that 3D opens 5 times in a row in WebKit with a memory cap.

## SECTION 3 · Map: one marker + one timeline bar (Map_Timeline_Wind/Tide, Wind_Bar_7)
1. **One marker.**
   - Remove the separate long-press crosshair. Hold anywhere to move the main marker.
   - The readout is attached to the marker: layer value + direction + gusts, swell, and the nearest station with its age.
   - "◎ back to spot" chip.
2. **One docked timeline bar** for every layer. No second sheet, no rounded "bubbly" card.
   - The row: play · time · "now" · layer chips.
   - Below: a day strip (Mon…Fri) with hour ticks; drag anywhere; a yellow time flag on the thumb.
   - **Wind (Wind_Bar_7):**
     - a row of direction arrows every 6 h on top;
     - bars colored by kt (0/7/12/17/25+ scale), white gust caps;
     - a dashed drone-limit line (from the chosen drone);
     - the daily peak labeled;
     - the legend "arrows = where it blows · bars = wind · caps = gusts".
   - **Tide (Map_Timeline_Tide, approved):** a filled curve, night shaded, with "High 3.0 ft 8:12a · Low 0.5 ft 2:24p" underneath.
   - **Clouds / radar:** the same bar with a % band.
   - The thumb drives the map layer **and** the marker readout.
3. **Scrubbing:** 60 fps, with no layer refetch while dragging (prefetch frames ±24 h).
4. **Contact sheets:** wind, tide, clouds, plus mid-playback.

## SECTION 4 · Sun · Moon · Night (boards now in docs/mockups: SkySun, SkyMoon, SkyB2n, D_Sky)
CORE couldn't build these because the boards weren't in the repo. Build them now in the current Look D colors (not the boards' black/IBM Plex style), with the same pill tabs as the Sky page.
- **Sun (SkySun):**
  - a hero card: "Golden light · 14 min left · sunset 6:12 WSW", with a sun-path strip;
  - a TONIGHT timeline: golden, sunset (with a compass), blue hour, dark, moonrise;
  - the Milky Way line;
  - the TOMORROW sunrise card.
- **Moon (SkyMoon):**
  - the real phase drawn large, rise time + direction + % lit;
  - tonight's rise / highest / set rows with compasses;
  - a 14-day phase strip;
  - darkest nights;
  - the "next big moonrise" card with a Plan button.
- **Night (SkyB2n):** next event, moon up %, Milky Way yes/no + window, darkest window, North Star direction, next meteor shower.
- Every moon and sun time is checked against the second ephemeris (≤ 5 min).

## SECTION 5 · About page (About_Story)
- The headline "One check before you go outside."
- Jwilly's story paragraph, exactly as in the mockup.
- The four "how it's different" lines.
- Rows: "How we got this · our hit rate" · "Data & credits" · "Source code".
- Footer "Made in Virginia Beach · Privacy".
- Never say "no account".

## SECTION 6 · Leftovers from CORE
1. **Offline car profile:** Tide still hit "needs a signal" once. Fix it and re-run `audit:offline` (all three profiles).
2. **Service-worker audit flake:** find out why the first run fails after 7A. Fix it or document it.
3. **Finish the live walk:** Calendar, Sun/Moon/Night, map layers + zooms (z12/z7/z4/z2), field report. Add them to `docs/batches/core-walk.md`.
4. **Console errors:** the three kinds from the walk. Explain each; fix it if it's real.
5. **The landing moon line** shows the date ("Tue 29 Dec, 11:39 PM").
6. **The first-run empty space** under "Try Beach · Park · Lake": shrink it or fill it with the 3 nearest saved/known spots.
7. **Cam distance:** keep it as is (no invented positions); hide the distance when the cam position is only an anchor.
8. **Go alert:** document that it fires only while the app is open (a closed-app push would need a server that learns the spot). Add "Keep ScoutNGo open for Go alerts" under the alert toggle.

## Not in this batch
- **Live sky everywhere:** waits for Jwilly's approval of the 8-state sheets (https://claude.ai/artifact/3hQysQnT6833c8Tm61rmbP).
- **Fishing "best time":** parked.

## FINAL REPORT (short bullets)
- Per section: the commit(s) and contact sheets.
- Section 0: per piece, shipped or reverted, and why CORE's strikes happened.
- Section 1: a before → after table for 12/13/14/16 Nov, plus the week bias so far.
- Section 2: the airspace data sources used, and the 3D five-open test result.
- Section 3: a scrub fps measurement.
- Anything left undone.
