# Batch BEST SKY · "Where's the color tonight?" (design locked 12 Nov)

Idea from Jwilly, 12 Nov: clouds are patchy, so the best sunrise or sunset isn't always where you are. Show the best place within a radius.

Run after Batch TRUTH. Same rules as Polish 2 and TRUTH:
- One commit per section, full gate, push after each.
- Revert a section that fails its own tests twice.
- Load average ≤ 12, 8 h hard stop.
- Contact sheets: iPhone WebKit 390×844 and 390×664, Android Chromium 412×915.
- Model proposes, code computes. Facts only.
- Nothing about the user leaves the phone.

Mockups: `docs/mockups/BestSky_Map.png`, `BestSky_Card.png`, `BestSky_Spot.png`. Build to match them in look D.

Sections:
1. Grid score plus satellite patches.
2. Spot list and "who sees the patch".
3. Page 1 · Map.
4. Page 2 · List, plus the home row.
5. Page 3 · Spot.
6. Calendar feed and "Color now" naming the best spot, plus the tests below.

## Truth case: 11 Nov sunset, The Back Deck, Lynnhaven Inlet (Shore Dr, Chick's Beach side, Lesner Bridge in frame)
- One patch of altocumulus over Lynnhaven Inlet lit pink and red underneath, with a clear orange horizon to the W/SW.
- The rest of the sky around VB was cloudless.
- Jwilly's call: "kinda good, not a banger." The color only happened there.
- The app said Maybe.
- Save as `fixtures/truth/2026-11-11-lynnhaven-sunset.json`. Add the photo time when Jwilly sends it.

## How it works (all code, nothing about the user leaves the phone)

1. **A grid of the area.**
   - Points about 5 km apart over the chosen radius (5 / 15 / 30 / 60 mi), around a *rounded* center.
   - The data comes from `/api/forecast` multi-point, cached by tile and hour. The function sees only the tile, never you.
   - The phone computes everything else.
2. **A score for each grid point**, reusing Sky fire:
   - **Canvas:** mid and high cloud 25–80% overhead and within about 50 km toward the sun.
   - **Gap:** low cloud mostly clear along the sun's azimuth out to 300 km.
   - **Not blocked:** no thick low deck overhead.
   - **Patchy nowcast:** within 3 h of sunrise or sunset, GOES-East visible/IR shows the real patches, which models smear out. Advect them with the wind at cloud height to sunrise or sunset time.
3. **Where to stand.** For each high-scoring patch, find the spots that see it:
   - The view toward the sun or the lit cloud is open, from facing and horizon.
   - Water in front for a reflection is a bonus.
   - A bridge, pier or skyline silhouette is a bonus.
   - Clouds overhead light up for anyone under them; the low glow on the horizon needs an open view toward the sun.
4. **Spot list, local first.**
   - Your saved spots.
   - Public viewpoints from OSM: viewpoint, pier, beach, boat ramp, park on water.
   - A small curated starter list per region, in the repo, fixed: Rudee Inlet, Lynnhaven Inlet / Crab Creek, First Landing, Chick's Beach, Lesner Bridge, VB Pier, Sandbridge, Back Bay, Ft Story.
   - **Optional later, opt-in:** share a spot to the public list through the same opt-in public route as field reports. Shared: spot, facing, "good for sunset or sunrise". No user identity.
5. **Distance.** Straight-line distance and bearing, computed on the phone from your location (if allowed) or the selected spot. No routing service.

## Layout (LOCKED 12 Nov): one page, three swipe pages with dots
- Same pattern as the Sky page (Sun · Moon · Night).
- Opens on page 1. Swipe or tap the dots to move between pages.
- The radius (5 / 15 / 30 / 60 mi) is shared across all three pages.
- Page 3 shows the spot picked on page 1 or 2 (default: #1).
- Boards: BestSky_Map (1), BestSky_Card (2), BestSky_Spot (3).

## What you see
- **Map layer "Color tonight":** a soft heat wash over the area for the next sunrise or sunset. Patches glow where the canvas plus gap score is high; it's empty where the sky is clear or blocked.
- **Card / list:**
  - "Best within 15 mi" and its time.
  - Three ranked spots, each with: name · distance · facing · Likely / Possible · why in 3 words ("patch overhead, gap W").
  - Tap a spot to open the map there at the color time, with the sun line.
- **Home row** when the best spot beats where you are: "Better color 6 mi W · Rudee Inlet · 4:55".
- **The calendar feed / "Color now" banner** names the best spot.
- **Facts only:** "Possible", "Likely". Never promise.

## Tests
- Replay 11 Nov: Lynnhaven Inlet ranks top within 15 mi, and VB Oceanfront scores lower.
- Replay 12 Nov sunrise: the east-facing beaches score Possible or better.
- The grid request sends only the tile, at most one request per tile per hour (privacy capture).
- The heat wash fits the visual budget: no labels on it, legend in "i".

## Mockups (approved 12 Nov)
BestSky_Map · BestSky_Card · BestSky_Spot on the design canvas, BEST SKY row.

## FINAL REPORT (short bullets)
- Per section: commit, contact sheets.
- The 11 Nov replay ranking: top 3 spots and their scores.
- Requests per open with the grid on; privacy capture.
- Anything left undone.
