# Offline

ScoutNGo was unusable in Shenandoah with no service. The geometry was fine: suncalc
and turf compute sun, moon, shadow, twilight, bearings and coverage on the device.
What failed was the map picture, the elevation, the forecast, and one thing nobody
expected.

## What actually broke

Every overlay the map draws (coverage cones, sun and shadow rays, the reach ring, the
sun in the sky) was built in MapLibre's `load` handler. `load` fires only once every
tile in view has loaded **or errored**. In airplane mode the tiles error at once and
everything draws. On a mountain with the radio on and no bars, requests are sent and
never answered, so `load` never fires and the computed geometry, which needs no
network, never reached the glass.

`scripts/audit-offline.mjs` reproduces both: **fail** (requests error) and **hang**
(requests never answer). Before the fix, hang mode drew no cone and no ray. Now the
overlays are built on `style.load`, which needs no network because the style is an
inline object, and every tile goes through a protocol handler that answers from the
device, fails at once when the device says it is offline, or gives up after
`TILE_TIMEOUT_MS`. The audit runs in the commit gate.

## What is kept, and where

| what | where | when |
|---|---|---|
| imagery z14–18 and terrain z14–15 for the venue's reach ring | Cache Storage `scoutngo-tiles-v1`, keyed by tile URL | automatically, when a venue is opened with signal, size shown first |
| imagery and terrain for a framed area | same | "Take this area offline" on the shoot card, size shown first |
| the venue's wind and cloud for the shoot day | localStorage `scoutngo.forecast.v1`, with the time it arrived | every time it is fetched |
| NOAA tide predictions for the station and dates | same | every time they are fetched |
| ground views, the plan | localStorage field pack | "Prepare field pack" |
| the app shell: the document and its hashed files | Cache Storage `scoutngo-shell-v1`, via the service worker | on install, and each new document that arrives |

One venue weighs 2.34 MB at the default 400 m ring and 29.61 MB at the 2000 m
maximum (`measurements/2026-10-25-venue-cache-400m.md`,
`measurements/2026-10-25-venue-cache-2000m.md`). Both are under the 40 MB ceiling the
automatic save enforces, so no zoom is cut today. If a venue ever measures over it,
the top zoom is left out and the card says so.

**Measured, not estimated.** Before anything downloads, imagery is measured with HEAD
requests (Esri answers with a Content-Length). The terrain bucket's CORS rule allows
GET only, so terrain is the tile count times the measured mean of 72559 bytes, and the
screen says "terrain estimated".

## What the screen says offline

- **Computed on the device:** no qualifier. It is exact.
- **A saved forecast:** its age beside the value, always. Over 12 h the age is
  marked. Over 36 h the value is dimmed and called an old forecast. On a chip the age
  rides on the label ("WIND · 3h").
- **A saved tide table:** where it came from and when. Predicted turns are astronomy
  and do not go stale, so it is not dimmed.
- **Nothing saved:** the card says so in words ("Could not reach Open-Meteo. Nothing
  is saved for this venue and day."). It does not blank.
- **No connection:** one word, "offline", in the top bar. No modal, no toast, no
  retry loop. "No connection" means `navigator.onLine` is false **or** the last
  request failed, because `navigator.onLine` is true on a mountain.

## Save for offline: the whole venue (29 Oct)

At a real shoot on 29 Oct there was no service and the map would not load
past the automatic ring. "Save for offline" on the shoot card takes the venue
whole (`src/lib/venuePack.ts`), size first and with a second tap that names it:

| what | how much |
|---|---|
| imagery and elevation | 1.5 km round the pin at z12–19 (elevation to its last zoom, 15), and 30 km round it at z8–11 |
| buildings, their heights, the sea | the OpenFreeMap map tiles at z12–14 over the near ring |
| forecast | the shoot day's wind at every height and cloud low/mid/high, the sky and wind by the hour, the sea |
| tides | NOAA tables for each of 7 days from the shoot day, and the month's turns |
| 3D scan | counted when one is already on the phone; never downloaded by the pack |

The size is an estimate before anything downloads: 24 imagery tiles per zoom
are HEAD-measured and their mean multiplied out, and the screen says so. What
a pack really weighs is in `measurements/2026-10-30-venue-pack.md`.

**Wi-Fi.** "Wi-Fi only" is on by default and a pack waits on cellular, where
the phone says which network it is on. An iPhone never does (Safari has no
`navigator.connection`), so there the button names the size and the card says
it is best saved on Wi-Fi.

**With no signal** one line sits under the chips: "Offline · using saved data
from 9:12 AM", the time the pack was saved; each chip with a saved value
carries its age; the Sun card says the sun, golden times and shadows are
worked out on the phone. Saved spots show "Offline-ready · 48 MB" and delete
the copy with two taps (the second names the size).

**The map reads saved tiles through its tile protocol**, not through the
service worker, as before: the worker keeps the app shell only (see above),
and a tile protocol that answers from Cache Storage works even on a launch
before the worker has installed.

`scripts/audit-venue-pack.mjs` (in the gate) saves a pack in WebKit with every
service answered by a fixture, takes the network away, reopens the venue and
asserts the fixture's imagery colour on the glass, the chips with their age,
the tide curve, the sun line and the fixture building's shadow.

## A cold launch with no signal

The app is often swiped away before the shoot, and a cold launch on a ridge used
to have nothing to show: `/` is sent `must-revalidate`, which forbids serving a
stale copy without asking the server.

**One service worker now keeps the app shell** (`src/sw/`): the document and the
hashed bundle, nothing else. A launch with no signal, or with signal that never
answers, opens the last build this phone saw within `NAVIGATION_TIMEOUT_MS` (3 s).
The map tiles, forecasts and kit it then shows come from the stores in the table
above, exactly as when the app was left open.

It cannot pin an old build, and the gate proves it rather than arguing it
(`scripts/audit-sw-update.mjs`, two real builds in a real browser): the document
is network-first, only content-hashed `/assets/` are cache-first, the build
check's no-store fetch of `/` passes straight through, and a new deploy writes a
new `sw.js` that replaces the old shell. The rules are in
`tests/serviceWorker.test.ts`.

**It needs one launch with signal first**, to install. A phone that has never
opened the app online since this shipped has nothing saved yet.

## Clearing Safari

Clearing Safari's history and website data wipes localStorage, and so the kit. The
backup is one ScoutNGo file (About › Backup): kit, shelved gear, units and saved spots.

Whether a **Home Screen** launch keeps storage separate from the Safari tab is
**untested**. It cannot be tested from a desktop. About › "Does clearing Safari erase
this?" carries the test: it shows which context is running and when its storage was
first written. Clear Safari, relaunch from the Home Screen, and compare the time.
When it has been run, the result goes here and in that card.
