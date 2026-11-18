# Batch SIMPLE-1: decisions

Each consequential call is listed with its options and the one picked. Jwilly can reverse any of them.

## Section 0: stop things popping up

**What the evidence showed** (WebKit as an iPhone 13, build 3db2f29, the scratchpad's `simple/probe0`):
- **A link or a reload with no home over it** (any query, any hash, the "reloaded while open" start) began in `setup`. That is the planner: `useState<Mode>('setup')` in App.tsx.
- **Drone's Preflight stayed on the map.** Path: Drone › Preflight check › the map's Back › the home › Map. The sheet was still at full height with the Preflight card. PlanMode stays mounted under the home, and its sheet state is its own.
- **A remount replayed the last request.** When the map remounted after the planner, the last `cardRequest` (tick > 0) was read again.

**What changed:**
1. The app starts on the map whenever there is a place. It starts in setup only with no place yet, because setup is where the pin goes (`startMode` in src/lib/mode.ts).
2. Each time the home steps off the map, the map resets: card back to the time bar, sheet down, no Fly, no 3D, no measuring. A page or card asked for on the way (the menu's Surf, the Drone page's Preflight check) still opens, a tick later.
3. A card request or a drawer request is spent when its mode is left.
4. A loaded spot no longer moves to the planner by itself. A shared plan's "Open" puts it on the map.

**Kept as ways into the planner, because each is a tap that asks for it:**
- Menu › Plan a shoot, which already had that name;
- the map's own "Plan a shoot" tool (Features);
- Now › "Plan here";
- a plan block's "fix this";
- the Viewfinder's "Set up a place";
- Menu › Kit and Menu › Saved, whose drawers live in setup.

Options for those last two: move the drawers out of setup (a restyle, which this batch doesn't do), or leave them. **Picked: leave them.** For the mockups, the Section 6 audit lists them as duplicate paths.

**Not reset when leaving:** the map's layers, including Airspace switched on in Features. A layer is a choice the user made on the map, not a sheet that pops up.

## Section 4: 3D leftovers

**The phone's evidence** (18 Nov, 1:07 PM, build 3db2f29): 13 × "3D not shown in 10 s" and 5 × "Fly not open in 3 s", with no shader or context error.

**The code at 3db2f29** (src/three/world/scene.ts:601): "shown" was `pending.n === 0 && ground.ready()`, that is, nothing in flight anywhere. The mid and far rings started at once, so they competed with the near square.

**What "shown" means now:** the first useful frame. That's the near square built on its terrain, wearing its coarse picture, with the 16 sharp tiles of its first ring settled (src/core/firstView3d.ts). The mid and far rings start after it.

Options were:
- (a) the near square only, without its sharp ring;
- (b) the near square plus its first ring;
- (c) everything, as before.

**Picked: (b).** (a) shows a blurry square, which would read as broken; (c) is the 10 s timeout.

Fly now waits for the same first useful frame plus the take-off ground. Before, it waited for any first frame. That frame can be one with no ground.

**Not covered by the cancel:**
- The water and woods vector tiles (`loadRawTile`) are not in the abort scope. The imagery and terrain requests are, and they are the bulk.
- One hung first-ring tile can still hold "shown" back for up to its 8 s timeout.

**Labs:** on by default everywhere, iOS included (Jwilly, 18 Nov). The switch stays in Settings › Labs.

## Section 4b: Open-Meteo 429

**Measured** in WebKit, with every Open-Meteo host answered by a fake (measurements/2026-11-18-openmeteo-calls.md):
- A cold home open sends 13 requests: 11 to api., 1 to ensemble-api., 1 to marine-api.
- None of them is a duplicate. The store already deduped in-flight requests and kept answers for 1–3 h.

**The defect:**
- After a direct 429, the next request went straight back to Open-Meteo.
- All 13 left in the first second, so a refused phone drew 13 refusals per open.

**What changed:**
- A 60 s hold after a 429: requests go to the forecast cache only, or get the kept answer with its age, or nothing at all, never a made-up value.
- The first back-off is now 60 s.
- Answers are always reused for at least 10 minutes.
- The home's Best Sky grid waits for the first load to settle, so 6 requests leave in the first second, not 13.

**Merging variables into one call:** no two requests ask the same question at the same point, so there was nothing cheap to merge. **Not done.**

**Decision for Jwilly:**
- Open-Meteo bills per location: a 25-point request counts as 25 calls.
- Best Sky's 7 grid tiles are 175 of the 220 billed calls per home open.
- Against Open-Meteo's 600 a minute, about 3 cold opens in one minute reach the limit. That fits the phone's 429.
- Neither piece lowers the billed count. Lowering it means fewer Best Sky grid points on the home, which reverses Batch BEST SKY, Section 4.

## Section 5: Mon 23 swell log

One marine request carries all four model ids, as waveModels.ts already did. That's one request at the home spot, not one per model.

It runs:
- once a day per spot;
- after the first load settles;
- only at a spot with a sea forecast;
- not at all if today's row already has the models.

The mark lives in localStorage (`scoutngo.swellDaily.v1`).

## Section 1: Drone = Wind · Airspace · Preflight

**Fly's door.** With the Plan tab behind `DRONE_PLAN_TAB` (off), the old "Preflight check" and "Plan the flight" buttons went with it, and Fly had no door. The options were:
- (a) cut Fly from the Drone page;
- (b) add a third button to Preflight's foot;
- (c) a small "Plan the flight" under the two buttons, shown only while Settings › Labs is on.

**Picked: (c).** Jwilly keeps 3D and Fly on for testing (Section 4), and the batch names only two buttons. The Labs switch takes the row away.

**The map's Preflight card** is now reached only through Fly, because the old "Preflight check" door went with the Plan tab.

**`DRONE_WIND_ROWS` (off)** hides the Airspace, Battery, Sky and GPS rows under the Wind bars. Preflight carries Airspace, Battery and Kp now.

## Section 2: addresses

**Why it said "Nothing found" at 3db2f29.** Both geocoders answered with the house. The phone dropped it in three places:
- Photon rows with no name;
- Nominatim `building` rows, put in the dropped group "other";
- the every-word filter.

**The truth points** are the local government's address points (VGIN, New Hanover County, Wicomico County), not the Census geocoder. Its points are interpolated along the street, and for big sites they were 211 to 333 m off.

**Ranking:** a new "place" group (a named feature holding every typed word, roads excluded) ranks above Businesses.

**Privacy note:** while diagnosing, two of the agent's first scripts sent a User-Agent containing Jwilly's email to Photon and Nominatim. It was stopped as soon as it was noticed. Every recording uses a plain test User-Agent, and nothing in the repo holds the email.

**Section 2: two strikes that weren't its own.**
- Both of Section 2's full-gate runs failed the same audit, fly, on its standalone pass ("the fly screen never came up", 215 s).
- Run alone on the same files, fly passed.
- **The diagnosis:** HEAD (80b904a, without Section 2) failed fly the same way with the heavy audits beside it. The cause was Section 1's audit edit: it gave the Drone page's Preflight tab a fixed 600 ms, and under load the tap missed.
- **The fix:** fly now waits for the tab and the button, and passes under the same load. It went in as its own commit.

Options:
- (a) keep Section 2 reverted, by the letter of the rule;
- (b) land it again after the fix, as a fresh piece.

**Picked: (b).** The rule is there to drop a piece that breaks the gate, and this one didn't. The patch stays in docs/batches/simple-section2-reverted.patch in case it is needed.
