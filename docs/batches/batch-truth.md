# Batch TRUTH · Thu 12 Nov morning check

Run after Batch Polish 2 has its final commit (check `git log`). If Polish 2's shadow section landed, Section 5 only fixes what is still visible.

Same rules as Polish 2:
- One commit per section, full gate, push after each.
- Revert a section that fails its own tests twice. Machine or parallel-run failures don't count.
- No browsers alongside the gate; wait if load average is over 12; 8 h hard stop.
- Contact sheets: iPhone WebKit 390×844 and 390×664, Android Chromium 412×915.
- Model proposes, code computes. Rule 28: facts only, never "safe" or "clear".
- Nothing about the user leaves the phone.

## Field truth for this batch

Save as `fixtures/truth/2026-11-12-vb.json` and use it in the tests below.

**Surf around 06:45–07:25, VB Pier / 1st St Jetty / Croatan**
- Surfline jetty cam *observed* 1–2 ft.
- Surfline forecaster: "knee high or less, mostly unrideable, ankle to shin, clean, offshore."
- Croatan cam (06:36–06:46): small clean lines.
- 44099 at 06:56 read 1.3 ft at 11 s:
  - swell 0.3 ft · 11 s ESE
  - wind waves 1.3 ft · 9 s SE
- Surfline primary swell: 0.8 ft · 9 s · E 95°.

**What we showed**
- Home: 0–2 ft, Flat.
- Week list: Today 1–2.
- Surf page week strip: Thu 0–3.
- Surf page chart: forecast line about 1.1 ft.
- Wind: "bumpy, cross-shore."

**Wind observations around 06:50–07:25**

| Station | Reading |
|---|---|
| CBBT (CHBV2) | 13 mph SSW 210° |
| Fort Story | 9 mph g13 SW 220° |
| Norfolk Intl | 7 mph SW 220° |
| Back Bay NWR | 5 mph g10 SSW 202° |

Our Wind page at 7:24 showed "Station KNTU 3 kt S · 5:56 AM", a reading 1.5 h old.

**Forecasts for the next days**

| | Surfline | Our numbers |
|---|---|---|
| Fri 13 | Flat | 1–4 / 2–3 / 1–4, wind NW 12 g21 |
| Sat 14 | 1–2 | 2–4 / 3–4 |
| Sun 15 | 0–1 | — |

**Tide:** Surfline high 9:07 AM 3.9 ft; ours 9:10 AM 4.1 ft.

**Sunrise (about 6:40)**
- Jwilly: "kinda fire."
- Cams 06:29–06:49: pink and orange lit altocumulus, low orange band on the east horizon.
- Mackerel altocumulus overhead after sunrise, with blue gaps.
- Public blend cloud cover: 15% at 6–8 AM, 100% at 9 AM.

**What we showed for the sky:** home said "Fog" while the map strip said "Overcast" or "A few clouds". Jwilly got no heads-up.

## SECTION 0 · Sunrise miss post-mortem (12 Nov)

1. Replay this morning's sunrise call for VB Pier from cached or archived inputs:
   - Open-Meteo past-days
   - IEM METARs (KNTU, KORF, KNGU)
   - GOES-East if the nowcast uses it
2. Report three things:
   - The call (Go / Maybe / Skip) at T-12 h, T-3 h and T-30 min.
   - Which input drove it.
   - Whether the calendar feed would have emitted an event.
3. Likely causes to check first:
   - A fog/mist flag from an inland METAR (BR at KNTU) suppressing the score while the coast had altocumulus.
   - Total cloud being used instead of the layers.
   - Mid cloud (altocumulus) being counted as a blocking deck instead of a canvas.
4. Fix the cause. Add a replay test: 2026-11-12 sunrise at VB must come out **Maybe or better**. The existing 29 Oct and 2 Nov replays must still pass.
5. **In-app "Go now":** when the app is open during a live color window that is Maybe or better (T-30 min to T+20 min), show one banner at the top of home: "Color now · sunrise 6:40 · look E". It taps to the Sky page. Code decides; no model.
6. **Fog word rule.** Show "Fog" only if the nearest *coastal* station reports visibility under 1 mi. Otherwise the condition word comes from the cloud layers.
   - Home and the map strip must use the same function, so they show the same word at the same time.
   - Test: today's 7:21 inputs must not say Fog.

## SECTION 1 · One surf number everywhere

1. Today the home card, home tomorrow card, week list and surf page week strip each compute their own numbers (0–2 / 1–2 / 0–3 for the same day). Make one function, `surfCall(spot, time)`, that returns all of these, and have every page read it:
   - the range
   - the size word
   - the wind word
   - the confidence
2. Ranges are one band wide under 4 ft: 0–1, 1–2, 2–3, 3–4. From 4 ft up they can be 2 ft wide. Never 0–2, 1–4 or 2–4.
3. Size word comes from the same face number:
   - **Flat:** under about 0.6 ft.
   - **Small:** about 0.6–1.5 ft. Today's truth (ankle to knee, clean) must read **Small**, not Flat.
   - Leave the Rideable / Fun / Firing thresholds as they are unless a test needs a change.
4. Test: render home, tomorrow, week list and surf page for the fixture day. Every surf number and word for the same day must match.

## SECTION 2 · Surf physics fixes

1. **Offshore-blown wind sea doesn't reach the beach.**
   - Wind-sea energy whose direction is more than 90° from the beach's facing contributes nothing.
   - NW wind at VB (facing about 100°) is offshore, so it can't build surf there.
   - Only waves travelling toward the beach count.
   - Re-run Fri 13 and Sat 14 and report our new numbers next to Surfline's. Don't tune to Surfline: the cams on Fri and Sat mornings are the truth, and Jwilly will send them.
2. **NDBC labels.** A component NDBC calls "wind waves" at 8 s or longer is treated as swell for the size word and the description. Today's 1.3 ft · 9 s SE is swell, not wind chop.
3. **Wind word relative to the beach.** Use five bands: offshore · cross-offshore · cross-shore · cross-onshore · onshore.
   - SSW 200° at a beach facing 100° is cross-offshore.
   - NW at VB is offshore. Fix the home card, which says "Cross-shore" for Fri NW.
   - Cross-offshore under 12 kt reads "clean", not "bumpy".
   - The wind dial wedges use the same bands.
4. **Buoys page headline** uses the buoy the forecast uses (44099 for VB), not the biggest reading. Duck can stay as a row.
5. Add `fixtures/truth/2026-11-12-vb.json` to the accuracy report: our call vs truth for size word and range.

## SECTION 3 · Wind observations: freshest and nearest

1. KNTU 5:56 was shown at 7:24.
   - Pull the latest METAR (IEM or aviationweather.gov).
   - Show the reading's age. Hide it if it's older than 75 min.
2. Add public coastal stations near each spot, choosing the freshest of the nearest three:
   - NOAA CO-OPS met at the Chesapeake Bay Bridge Tunnel (verify the ID; CHBV2 / 8638863)
   - NDBC C-MAN / NOS stations
   - KORF, KNGU, KNTU
   - Back Bay NWR, if it has a public feed with no key
   - Report the IDs found. No paid or keyed sources.
3. Wind page: "Station" becomes "Nearest station · CBBT · 11 kt SSW · 4 min ago".
4. Home drone card: label the number "at 400 ft" so it doesn't look like it contradicts the wind card (7 vs 14 kt).

## SECTION 4 · Home and week polish (from the 12 Nov screenshots)

1. **Label collisions.**
   - Drone card x-axis prints "now" and "noon" on top of each other ("nmoon", "now6a"). Drop any tick label within 28 px of another; "now" wins.
   - Surf card "2.0 ft" end bubble is clipped at the card edge and sits on the y labels. Keep bubbles inside the plot and nudge them left when they hit the edge.
   - "steady all day" overlaps the top of the chart. Move it into the header line.
2. **Y axes:** every home chart shows 0 / mid / max labels (like the surf page's 0 / 1.5 / 3), never just 1 and 3.
3. **Tomorrow page charts** start at 12a with no "now" line. Day labels are 12a / 6a / noon / 6p.
4. **Week page.** "Best this week: Tue fish · Wed drone" sits above rows that say Skip for Tue and Wed.
   - The best line and the row pills must come from the same call.
   - A row's pill reflects its best activity.
   - Rows: reduce the empty height, so 7 rows fit with room.
5. **Wind text** "cross-shore until 9 AM" wraps to 3 lines. Shorten it to "cross-off · offshore 9a" or clamp to 2 lines with no orphan word.
6. **Empty gap** above the "Next:" row: tighten it, or let the cards grow to fill. "Next: drone calm from 9:30 AM / Cams · VB Pier" is two things in one row: keep only the Next line, since cams live in the menu.
7. **Bottom band.** A navy band shows below the buttons on every home page and the map: the gradient doesn't reach the bottom safe area. Extend the background through `env(safe-area-inset-bottom)`.
8. **Tide check.** Surfline has high 9:07 3.9 ft; we have 9:10 4.1 ft. Confirm our station and datum (MLLW) and report. Change nothing if ours is right.

## SECTION 5 · Map fixes

1. **Shadow tile seams.** At 6:59 AM VB Pier, lighter rectangles with hard edges show at tile boundaries.
   - Shadows must be continuous across tiles: render with a margin as wide as the longest shadow, or composite in one pass.
   - Test: pixel difference across a tile edge under a threshold.
2. **Empty bottom sheet.** It goes blank (no time slider) when the airspace layer or LAANC grid is on. The time slider must always show.
3. **Airspace zoomed out.** At regional zoom the red polygons and dashed circles are too heavy and draw over the status bar.
   - Thinner strokes, about 15% fill.
   - Dashed circles fade out below about z9.
   - Nothing draws under the status bar.
4. **Small fixes.**
   - The pin hides under the 3D button: keep pins clear of the control column.
   - LAANC grid "250" labels clip at the left edge: inset them.
5. **Iridescence / "Near you in the next 24 h" card.**
   - Compact it to one line.
   - Add a "Show me" action that jumps the map and time to it.
   - Keep "Not now".

6. **Shadow speed (left over from Polish 2: 32 fps at 4× CPU slowdown, target 60).**
   - Stop re-rendering the plan every minute while scrubbing.
   - Move the shadow raster to a worker (OffscreenCanvas). On WebKit without it, fall back to the current path.
   - Target: 50+ fps at 4× slowdown. Report the median of 3 runs.
7. **Flaky audit.** The service-worker audit sometimes fails its first run ("B was never cached with A dropped"). Find out why rather than retrying.

## SECTION 6 · Airspace sheet cleanup

1. **Raw FAA values.**
   - "to -9998" is the FAA's "up to overlying airspace" code; show it as "up to the airspace above".
   - Check for other sentinels (-9999 etc.) and map them all.
2. **Names** in title case: "Oceana NAS Class D", not ALL CAPS.
3. **Lead with one line:** "Controlled · LAANC up to 250 ft here". Everything else sits behind "Details".
   - The TFR / NOTAM warning appears once, not twice.
   - The 250 ft ceiling appears once.
4. **Small fixes.**
   - The "I have LAANC here" checkbox uses the app's toggle style, not a black square.
   - US spelling ("generalized").

## SECTION 7 · Wind = the whole map (Windy-style, our look)

From the 12 Nov 7:41 screenshots: the wind card + sheet cover about 60% of the screen, and the wind field disappears when zoomed out.

1. **Wind layer on = full-screen map mode.** Hide every other map control except back, search pill and compass.
2. **Top: one thin reading pill** under the search: "9 kt S · g11 · KORF 5 SW, 4 min ago". It's one line.
   - Replace the big card: it overlaps the Wind chip and compass when zoomed out.
   - Drop "Wind shown for this area".
3. **Bottom: one thin bar, ≤ 96 px plus the safe area.**
   - Play button.
   - Time and day ("Thu 7:22 AM").
   - Scrubber with day ticks.
   - Model chip (Blend · HRRR · ECMWF in a small menu).
   - Surface / 400 ft chip.
   - The legend is a 4 px gradient line along the top of the bar, with 0 / 10 / 20 / 30+ ticks.
   - The explanation text moves behind "i".
   - Dragging the bar up shows the hourly table for the crosshair point.
4. **Time.** The bar opens on now (it showed 7:22 at 7:41). It stays synced with the main time slider afterwards.
5. **Coverage at every zoom.**
   - At 500, 1000 and 2000 mi the field only covered patches.
   - At 1000 mi it said "No wind here" over the US.
   - Load a global grid (GFS/ICON) for low zooms and HRRR for close in, so every visible pixel has wind.
   - "No wind here" only appears if the data truly failed. Then it says "Wind didn't load · Retry".
   - Hide the sun line below about z5.
6. **Look.**
   - Same particle style, with fewer streaks when zoomed out.
   - The colour field fades to about 60% so the satellite shows through.
   - Use globe projection below about z3 (MapLibre globe) if it holds 50+ fps on WebKit; otherwise stay flat and report.
7. **Crosshair arrows.** At the crosshair, draw the wind arrow, and at sea also the primary swell arrow, labelled "16 kt" / "swell 1.3 ft 9 s".
8. **Check:** contact sheets at z12, z7, z4 and z2. The audit must show wind colour under the crosshair at every zoom.

## FINAL REPORT (short bullets)
- Per section: commit, contact sheets.
- Section 0:
  - the replayed call at each stage and the cause found
  - whether the feed would now emit an event for 12 Nov
- Section 1: the matching table for all pages.
- Section 2: new Fri and Sat numbers next to Surfline's.
- Section 3: station IDs found.
- Tide datum check.
- Anything left undone.
