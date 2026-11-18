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
