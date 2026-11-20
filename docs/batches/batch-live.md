# Batch LIVE · Sat 14 Nov (from phone tests 13–14 Nov)

## Rules
Same as NOW:
- One commit per section, full gate, push after each.
- **Two strikes and the section is reverted.** Gate-audit failures caused by your own change count as strikes.
- Load ≤ 12; hard stop at 8 h.
- Contact sheets at 390×844, 390×664 and 412×915.
- Model proposes, code computes. Facts only.
- Nothing about the user leaves the phone.

Approved boards are on the design canvas and should be exported to `docs/mockups/`: Menu_Pop (menu A), the SKY · SUN / MOON / NIGHT swipe boards (build-touch 7e), D_Sky.

## Field truth fixtures (add to fixtures/truth/)
- **14 Nov 5:38 AM, Sandbridge:**
  - The home card said "4–6 ft Firing" while its own chart and the buoy dot read 1.7 ft. The week page said Sat 1–2.
  - Wind was N 20 kt, gusts 24, cross-onshore. Truth: small and messy, not firing.
- **14 Nov 12:19 PM, VB:** the home said "Overcast" and "0–1 ft Flat" while the chart's now-dot read 2.3 ft. Jwilly's photo: broken cumulus, sun through, blue gaps → Mostly cloudy.
- **14 Nov 12:21 PM, Sky Now:** "no station report in the last 75 minutes" at midday.
- **13 Nov evening twilight:** clear, a few dark clouds, no color. Matches "Color unlikely" (hit).

## SECTION 0 · Data truth first
1. **The station fetch is failing on the phone.** Sky Now said "no station report in the last 75 minutes" at noon, but KNTU and KORF report hourly.
   - Find out why on iOS (CORS, cache, the 75-min rule using the wrong clock or timezone, the proxy). Fix it.
   - Show the station's age wherever it is used.
   - Add a gate check that runs the station path against a recorded live METAR response **with real timestamps**.
2. **Sky word by consensus.** One OVC report must not outvote the others.
   - Use the nearest coastal station + nearest airport within 30 km.
   - When they disagree, take the lesser cover unless both are fresh and agree.
   - Every surface uses the same function: home, menu, map strip, week icon, Weather.
   - Fixture: 14 Nov 12:19 must read Mostly cloudy, not Overcast. The menu's "56° Clear" at Wrightsville must also go through it.
3. **One surf series.** The home headline range, size word, chart line and now-dot all come from `surfCall` for the same hour.
   - Fixtures: 14 Nov 5:38 must not say 4–6 while the chart reads 1.7; 14 Nov 12:19 must not say 0–1 while the dot reads 2.3.
   - Report which path produced each wrong number.
4. **Wind-quality words.**
   - "Firing" and "Fun" can never show with onshore or cross-onshore wind over 12 kt. Show "Choppy" (12–18 kt) or "Blown out" (>18 kt) instead.
   - Add a test per band.
5. **Wind card text:** one line, future changes only (at 5:38 it said "→ cross-off 5a", which was already past).
6. **Sky card:** never blank ("—"). Show "No call yet · checks 3 h before" when there is no call.
7. **Belt of Venus alone stays below Possible** (decided).

## SECTION 1 · Wind map: every zoom, rotation, playback
1. **Coverage.**
   - Wind shows at every zoom down to world view, using a global GFS/ICON grid at z ≤ 5 blended with HRRR where it exists.
   - The reading under the crosshair must not change by more than 3 kt between z12 and z7 at the same point. On 14 Nov it went 20 → 9 kt.
2. **No "Wind didn't load" at world zoom.** Find the failure at z2 and fix it.
   - The audit must also run against **live** tiles at z12, z7, z4 and z2, not only the fixture: a separate `audit:wind-live` step, allowed to skip offline.
3. **Misregistered tiles.** Far out, the wind rectangles drew skewed over the wrong place (Europe/Africa showed), and the map was rotated.
   - Lock rotation in wind mode, or reset north on entering it.
   - Fix the projection math for low-zoom tiles.
4. **Playback.**
   - While playing, the day scrubber stays visible with a moving thumb, and the bar shows day + time ("Sat 3 PM").
   - Tap the scrubber to pause and jump.
5. **Banners.**
   - Hide all banners in wind mode.
   - Banners must be about the place on screen, or name the distance ("Sandbridge · 290 mi"). At Wrightsville it said "Sky color… Sandbridge Beach".
6. **Contact sheets:** z12, z7, z4 and z2, plus playback mid-way.

## SECTION 2 · Sky pages
1. **Sky Now headline.** Name the thing and where to look: "Textured clouds now · sun through gaps, look S". Not "Worth a look · One thing in the sky now".
2. **Sky picture on Now.** A side view with the cloud layers at their heights (from station + satellite), the sun at its real elevation and azimuth, and the gaps drawn. Same style as Best Sky "Why here".
3. **Rare light must be rare.**
   - Light rays need the sun ≤ 15° up, broken low cloud 30–80% toward the sun, and models agreeing.
   - Show at most 3 per week, ranked. If none qualify: "Nothing rare this week".
   - Fixture: the 14 Nov list (rays at 3 PM nearly daily, sun 18–19°) must drop to ≤ 1.
4. **Sky page layout.**
   - The Viewfinder / Calendar buttons are clipped flat at the bottom; fix the container.
   - Fill or shrink the empty Next card.
   - No stray bullet.
   - No big empty area under the footer links.
5. **Rebuild Sun · Moon · Night** from the approved boards (SKY · SUN / MOON swipe, SKY B · v2 night). Use the same pill tabs as the Sky page.
   - **Sun:** a big side-view arc over the horizon, with a now marker, golden and blue hour bands, and sunrise/sunset with direction.
   - **Moon:** the real phase drawn large, rise/set with direction, % lit, a 14-day phase strip, and the next big moonrise.
   - **Night:** Milky Way yes/no + window, darkest window, North Star direction, next meteor shower.
   - Fix the compass labels (W showed as N; the top N was clipped).
   - "Now on the bar" becomes "Sun now · south, 34° up".
   - Split the "Line it up, the light, the sun's day, a moonrise, cams" link into real rows, or drop it.
   - Moon and planet positions must be checked against a second ephemeris, within 5 min.

## SECTION 3 · Calendar and week
1. **Calendar honesty.**
   - Forecast icons (sky color, glassy, surf) only within 7 days, with days 4–7 dimmed with "?".
   - Astronomical items (low tide near sunrise/sunset, full/new moon, alignments) can show any day.
   - On 14 Nov it showed sky color on 22 and 26 Nov, and glassy to 28 Nov: remove those.
2. **Past days.** Show what happened from the truth log and field reports (fired, photos logged) in a muted style.
3. **Chips are real toggles**, with a clear on/off state. Fix the low-contrast Glassy icon. When a filter has nothing in range, say "none in the next 7 days".
4. **Day card.** The full day: surf, wind, tide times, sunrise/sunset + color call, moon. It fills the space. "Plan this day" stays.
5. **Placement.** Keep Calendar in the menu.
   - Add "See the month ›" at the bottom of the home's week page.
   - The Sky page link opens it filtered to Sky color + Moon.
6. **Week page.**
   - Rows normal height, no stretching.
   - One pill per row, for that day's best activity.
   - The "Best this week" line must match the pills (it said "Tue fish" while Tue's pill said "Calm").
   - Same columns every day.

## SECTION 4 · Menu A and home charts
1. **Build menu A from Menu_Pop.**
   - Each card gets a gradient tint by type and a faded drawing in the bottom-right corner (sun / wave / wind lines / tide curve / sunset / drone).
   - The rows get colored icon tiles.
   - **Live art:**
     - The wind lines point the real direction.
     - The tide curve shows rising or falling.
     - Weather art follows the sky word (sun, clouds, rain, moon at night).
     - Sky art follows the color call.
   - Art ≤ 60% opacity and never under the value.
   - Inline SVG only, ≤ 8 KB total.
2. **Chart labels.** Value bubbles never overlap lines, dots or axis labels (drone "22 kt" again on 14 Nov). Extend the pixel-overlap audit to the drone chart.

## SECTION 5 · Planner and 3D
1. **One simple card per position.**
   - It shows: light (front-lit etc.) · lens · height · range · tide · wind at height · airspace chip.
   - Actions (order, stand here, only this, duplicate, delete) sit behind a "…" menu.
   - Explanations (Part 107, focal reach, Street View) sit behind "i". Hide Street View for drone positions.
   - Feet everywhere for US users.
   - One "Set where you stand" button for the pilot position.
   - No horizontal scroll at 390 wide; the card ran off the right edge on 14 Nov.
   - Normal-case button labels, no letter-spaced caps.
2. **3D stuck on "Loading the 3D view…".** Find the cause on iPhone.
   - After 10 s, show "3D didn't load · Back to 2D". Never leave a blank map.

## SECTION 6 · Drone Fly screen
1. **The top-left "Land and keep / Land / Keep flying"** control wraps and clips. Make it one row (Land · Keep flying).
2. **The airspace banner** sits below the HUD row, never over the controls. After 5 s it collapses to an amber chip; tap to expand.
3. **The battery "43 min"** stays on one line.
4. **Animated ground:** no posterized blotches or stair-step edges. Use higher-res landcover, blended edges and a softer palette. Real is the default when there is signal.
5. **Sky:** no vertical banding or tiled texture. Soft cloud shapes, with the count tied to cover.

## SECTION 7 · Live sky backgrounds (contact sheet for Jwilly before it ships to all pages)
1. **The background shows the sky at the spot**, from the same computed state as the sky word: sun elevation, cloud cover by layer, rain, fog, moon.
2. **Eight states:**
   - Clear day: blue (as now).
   - Partly / mostly cloudy: soft cloud shapes over blue, amount = cover.
   - Overcast: a textured grey-blue deck, not flat grey.
   - Rain: a darker deck with faint streaks.
   - Fog: haze.
   - Golden / sunset: the current warm gradients.
   - Night clear: dark navy, star count = clear fraction × darkness, moon at its real phase and position.
   - Night cloudy: dark with dim clouds, no stars.
3. **Rules:**
   - Drawn in code, ≤ 30 KB, no photos.
   - Mostly static, with a slow drift that turns off with Reduce Motion.
   - Cards keep 4.5:1 contrast; add a scrim if needed.
4. **Build behind a flag** (Settings › Live sky, default on for home only). Produce a contact sheet of all 8 states on home, Sky page and Weather page for Jwilly to approve before it goes everywhere.

## Not in this batch
- **Landing page:** waits for Jwilly's pick of Landing_A–D.
- **Grey-day colors:** replaced by Section 7.

## FINAL REPORT (short bullets)
- Per section: the commit and its contact sheets.
- Section 0:
  - The cause of the station failure.
  - Sky word, surf and wind-quality tables for each fixture, before → after.
- Section 1: the crosshair reading at z12, z7, z4 and z2, and the live-tile audit result.
- Section 2: the Rare light count per week before → after.
- Section 5: the cause of the 3D hang.
- Section 7: the 8-state contact sheet path.
- Anything left undone.
