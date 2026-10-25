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
- **No connection:** one word, "offline", in the venue bar. No modal, no toast, no
  retry loop. "No connection" means `navigator.onLine` is false **or** the last
  request failed, because `navigator.onLine` is true on a mountain.

## The one thing this does not cover: a cold launch with no signal

There is no service worker, by rule. Without one, **the app's own page cannot be
served from the device**. `/` is sent `max-age=0, must-revalidate` (see
`docs/deploys.md`), which forbids serving a stale copy without asking the server.

So everything above works when the app is **already open**: launched with signal,
or still in memory from the drive in. If iOS has evicted it and it is launched cold
on the ridge, Safari has nothing to show.

Until that is decided, the habit that covers it: **open the venue before you lose
signal, and do not swipe the app away.**

Changing it means one of:

1. Allowing a service worker for the document only, which `tests/noServiceWorker.test.ts`
   forbids and `docs/deploys.md` argues against.
2. Relaxing `must-revalidate` on `/` so Safari may serve its stale copy when offline.
   That weakens the stale-build mechanism the header exists for, and whether iOS
   honours it for a Home Screen launch is untested.

Both are the owner's call, not a formatting choice.

## Clearing Safari

Clearing Safari's history and website data wipes localStorage, and so the kit. The
backup is one ScoutNGo file (About › Backup): kit, shelved gear, units and saved spots.

Whether a **Home Screen** launch keeps storage separate from the Safari tab is
**untested**. It cannot be tested from a desktop. About › "Does clearing Safari erase
this?" carries the test: it shows which context is running and when its storage was
first written. Clear Safari, relaunch from the Home Screen, and compare the time.
When it has been run, the result goes here and in that card.
