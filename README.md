# ScoutNGo

A shot planning tool for shooting an event at a venue you have never physically
visited.

You give it a location, a satellite screenshot of the venue, what happens there,
and how you shoot. It gives back specific camera positions plotted on that
image, with lens, focal length, what to capture, and whether you will be lit or
backlit at that time of day.

It is not a sun calculator. PhotoPills already does that well. The thing that
does not exist is "here is where to stand and what to shoot, for how I shoot."

Built for solo shooters who fly in cold and burn the first hour working out
where to stand.

## How it goes wrong

Three failure shapes account for almost every real defect in this repo: two
sources for one fact, a check that cannot fail, and a check pointed at the
wrong object. They are written down with their real instances in
[docs/failure-modes.md](docs/failure-modes.md), which is worth reading before
adding a check of your own.

## It works with no API keys

Clone it, `npm install`, `npm run dev`, and the whole planning loop works. No
account, no keys, no card.

**Free, out of the box:**

- The satellite map, search, and dropping the venue pin
- **Placing camera positions by hand**, which is the primary way to build a plan
- Every computed number: sun azimuth and altitude, lighting classification,
  field of view, frame width, range, standoff bands, the reach ring
- Siting checks against real OpenStreetMap data: in water, in a roadway, a
  drone path over a structure
- A Ground / Air / Both filter, which decides both what the map shows and what
  a generate is allowed to come back with
- Air positions with an altitude in feet above ground, and a pilot position you
  place to measure the distance from
- Tide from NOAA, including the small subordinate stations that are usually the
  ones actually at a venue, and the time scrubber that moves every number
- Shot lists, saved setups, the kit editor, Field mode, offline field packs
- Installing it to your home screen and using it as an app

**Three optional keys, each adding one thing.** Everything above keeps working
without them, and anything that needs one says so in a line where the feature
would be, rather than failing:

| Key | Adds | Without it |
| --- | --- | --- |
| `MAPBOX_TOKEN` | Better venue search, autocompleting as you type | Search falls back to OpenStreetMap's Nominatim and Photon, which are good at addresses and weaker on coastal landmark names |
| `GOOGLE_MAPS_API_KEY` | A Street View photo on each position card | The card says there is no ground view, in the same space |

**No key is ever required for the primary action on any screen.** Suggesting
positions needs no key at all: it works out where to stand from the kit in the
bag, building footprints and heights, water, airspace, your marks, terrain when
it is on, and the sun. No model chooses, moves or scores a position.

## The NOW screen

One tap from launch, for the moment the app was useless in: driving, the sky
goes off, and there is no time to enter a pin, a date and a window.

No map, no scrubber, no setup, nothing to scroll. Six lines in a fixed order,
largest first:

```
SUNSET IN 14 MIN
Look west-southwest.
Peak light 18:44 to 18:53.

Looks like thick mid cloud with a clear slot at the horizon.

Nearest open ground that way: 0.4 mi, a beach
```

**Direction in words, never degrees.** "Look west-southwest" is something you
can act on at a windscreen; 254.1° needs a compass app and thirty seconds
nobody has. The degrees are the receipt and they belong in the planner. A test
asserts there is no degree sign and no coordinate anywhere on the screen.

**It asks for your location on the tap, and keeps nothing.** Same rule as
everywhere else: never an IP lookup, never stored, gone when you close it.

**"Open ground" never means "clear view."** The line reports that
OpenStreetMap has water, beach, park, farmland, meadow or parking mapped
within a few miles in roughly the sun's direction. It cannot know what is
standing in the way — a treeline, a dune, a row of houses on the far side of
the field — so it does not say. Same rule as the hazard layer. And if nothing
is mapped it says so, because silence there would read as a claim about the
ground rather than about the map.

It ends with **PLAN THIS SPOT**, which drops into Setup with that coordinate as
the pin and today's date already set. The glance is a door into the app, not a
dead end.

**Remind me tomorrow** downloads an `.ics` file for tomorrow's peak window.
Generated on the device: no server, no subscription feed, nothing to revoke.
The event says in its own description that it is *a reminder to look, not a
prediction* — the sun times are arithmetic, tomorrow's sky is not, and nothing
here knows it from today.

## One switch for the numbers

The app is full of degrees and coordinates and almost none of them are the
answer. It says "SIDE-LIT, sun across the frame", which is the answer, and then
prints 254.9°, which is the receipt.

Every receipt sits behind **one** control, under Settings, remembered on the
device and **off by default**. Not two modes — two modes means two builds to
test and a bug report where the first question is "which mode were you in" —
and not a hamburger, which hides things people need.

| Behind the switch | Always visible |
|---|---|
| compass bearings in degrees | the light word and its explanation |
| solar azimuth and altitude | the band name and the peak window |
| latitude and longitude | the time |
| the raw FOV plate | altitude in feet, wind, tide, distances |
| | every warning and every honesty line |

Hiding a receipt takes its own label with it: a "Camera bearing" heading above
an empty cell is worse than neither. What it never takes is a sentence.
`src/components/numerals.test.tsx` asserts that every warning and honesty line
survives with the numbers off, and that no paragraph or list item present with
them on goes missing with them off. **Quiet is not the same as simple.**

The direction survives where the degrees go: the field card still says `WSW`
and still gives the distance in metres, because those are what you act on while
walking.

## The rule: the model proposes, code computes

Anything that is arithmetic is arithmetic. The model's job is judgment, meaning
where a shooter would stand, what the shot is, and what the risk is. Never
geometry.

A throwaway prototype asked the model to work out lighting direction and it got
it backwards on half the positions. It put a camera northwest of a venue, which
means the camera points southeast at 135 degrees, with the sun at 134 degrees,
and labelled it "sun behind camera, front lit." That is the exact opposite of
the truth, and it is the one question the tool exists to answer.

So:

- `src/core/` holds pure functions with tests and no dependencies apart from
  `suncalc`. Sun position, lighting classification, field of view, kit profile.
- The model returns positions and shot ideas. The app then computes the lighting
  itself and overrides anything the model claims about it.
- That prototype failure is a named test in `src/core/lighting.test.ts`. If it
  ever goes green in the wrong direction, the build fails.

### The same rule applies to the app's own guesses

A model is not the only thing that can state something it does not know. The
app used to put a red badge on a position reading "the frame is wider than the
event, the subject will be a speck", which it worked out by comparing the frame
width against a flat 60 metres hard-coded in `src/core/fov.ts`. Nobody had ever
been asked how big the subject was. On a drone shoot it fired on every position,
because flying is how you get wide.

So the frame width, which is measurable, is printed on every card: "at 24mm from
here you frame 152 m across". The judgement, which is not, needs a number from
the shooter. **Subject across**, in Setup, is that number, in metres, and it is
blank by default. Blank means nothing is claimed: no comparison, no flag. Filled
in, the card states the multiple and the map flag carries it, and neither is red,
because a wide frame is a choice rather than a fault.

### An air position can only use the aircraft's cameras

A drone position's optic picker lists the aircraft's own cameras and nothing
else, and a ground position's lists glass and no aircraft cameras.
`src/core/optics.ts` is the only place an optic list is built, `setOptic` throws
on an optic the platform cannot carry, and Suggest builds an air position only
from an aircraft camera in the bag, at its published focal length. The wrong
thing is not hidden, it is unreachable.

## Times are venue local

The date and time window you type are wall clock readings **at the venue**, not on
your phone. They are resolved through the timezone of the venue's own coordinates,
found offline from a packed boundary table, and only then handed to the solar core
as absolute instants.

This is the difference between right and wrong for the entire use case. Standing in
California planning an 11:00 start in Maryland, the old behaviour read 11:00 Pacific,
which is 14:00 at the venue: three hours of solar azimuth out, so every lighting
class on every position was wrong, in the one situation the tool exists for.

The zone is shown, never assumed. The window line says `11:00 to 15:00 EDT`, the sun
readout names the zone in full, and if your device is set to somewhere else it says
so. Moving the pin across a timezone boundary changes the underlying instants
without the form text changing, because 11:00 at the new place is a different
moment. That is correct, and it is why the zone is on screen.

`src/core/timezone.ts` has the conversion and the reasoning; `src/core/timezone.test.ts`
pins it, including both sides of a daylight saving change.

## Add to Home Screen

There is a web app manifest and a set of icons, so adding the site to a home screen
gives a standalone app with no browser chrome, named ScoutNGo, on the same near-black
theme as everything else.

**Offline is a goal**: the app was unusable in Shenandoah with no service. One
service worker keeps the app shell so a cold launch with no signal opens. Opening a venue with signal saves its
imagery (z14–18) and terrain for the reach ring, measured and shown before it
downloads: 2.34 MB at the default 400 m ring and 29.61 MB at the 2000 m maximum
(`measurements/2026-10-25-venue-cache-400m.md`,
`measurements/2026-10-25-venue-cache-2000m.md`). "Take this area offline" on the
shoot card saves a wider area for a trip, size first. Tiles live in Cache Storage
and are read by the map through a MapLibre protocol, not the worker. Everything
computed works with the radio off. See [docs/offline.md](docs/offline.md).

The icons are generated from the design tokens by `scripts/make-icons.mjs`, using only
the standard library. Change the palette or the mark there, run `node scripts/make-icons.mjs`,
and commit what it writes.

## The map image sent to the model

The generate request carries a JPEG of the current map view. Its resolution is one
named value, `CAPTURE_MAX_LONG_EDGE` in `src/core/capture.ts`, and it is set by
measurement rather than taste.

**To A/B it yourself**, append `?captureEdge=1568` to the app URL. That overrides
the long edge for that page load only and changes nothing on disk, so the same
venue can be generated at two resolutions back to back and the resulting plans
compared.

Compare them on placement, not on the clock. The app already computes everything
needed: site warnings check every position against real OpenStreetMap water and
roadways, and the coverage panel reports how many bearing sectors the plan spans
and how many positions landed on the subject with no sightline at all.

**Result of the last run, 17 September 2026**, three generates per arm at the
calibration venue, interleaved:

| | 2532px (default) | 1568px |
| --- | --- | --- |
| Visual tokens per request | 3,822 | 1,456 |
| Base64 payload | 699 KB | 347 KB |
| Model leg, mean | 11,622 ms | 11,795 ms |
| Positions in water | 0 of 18 | 0 of 18 |
| Positions in a roadway | 1 of 18 | 1 of 18 |
| Bearing sectors, mean | 3 | 3 |
| **Positions landing on the subject** | **0 of 18** | **5 of 18** |

The smaller image was not faster. A generate is dominated by the model composing
its answer, not by reading the picture, so cutting the input by 62 percent bought
nothing measurable. It also placed worse: at 1568 the model repeatedly put
positions on the subject itself, which have no bearing, no sightline and no
contribution to coverage. At 2532 that did not happen once.

So 2532 stays. Note that total wall clock is *not* a valid comparison here:
Overpass caches a bounding box server side, so whichever arm queries first in a
pair looks slower for reasons that have nothing to do with the image.

## Which build am I looking at

There is **one service worker, for the app shell only** (`src/sw/`), so a cold
launch with no signal opens the app. It was kept out for years for one reason: a
worker is a cache in front of the code, and the classic failure is a phone on an
old bundle forever. It cannot do that here. The document is network-first with a
3 s timeout, only content-hashed `/assets/` are cache-first, and everything else
passes through, including map tiles and the build check's no-store fetch of `/`.
`scripts/audit-sw-update.mjs` proves it in the commit gate with two real builds:
a new deploy is adopted on the next cold launch, and an offline cold launch opens
whichever build was last seen. `tests/serviceWorker.test.ts` holds the rules.

What *does* hold a stale build is iOS Safari, and a home-screen app more
stubbornly still, keeping `index.html` and therefore keeping the hashed asset
URLs that document names.

So the short commit hash is compiled in and shown under **Settings**. A `+`
after it means that build came from a tree with uncommitted changes, so it
corresponds to no commit. Quote it with a screenshot and there is nothing left
to disagree about.

The app also checks, on a fifteen-minute timer and whenever it comes back to
the foreground, whether a different build is deployed: one request for
`index.html` with `cache: 'no-store'`, comparing the stamp in it against the
one compiled in. If they differ it says so and offers a button. **It never
reloads by itself** — you may be mid-shoot — and offline the check is silent,
because no signal is not an error. Saved spots and field packs are in
`localStorage` and survive the reload either way.

## Drones, and what this app will not tell you

An air position carries an altitude in feet above ground level. The field
defaults to 200 and stops at 400, which is the altitude limit in FAA Part 107.
Putting the limit at the top of the field is a convenience, not a verdict:
staying under it does not make a flight lawful, and this app does not know your
airspace, your aircraft, your waiver, or your certificate.

The altitude is in the arithmetic, not just printed. It used to be printed
only, which meant a drone hovering 200 ft directly over the subject was
reported as being 0 m away and framing 0.0 m, with no warning. The true figures
are a 61 m slant range framing 91 m, which is a landscape rather than the shot.
Range, frame width, the standoff band and the framing warnings all come off the
slant range now.

You can place a **pilot position**, and the map draws a dashed line from it to
each air position. The card prints two numbers: the distance across the ground,
and the real distance from the pilot to the aircraft, which at 400 ft is 122 m
of it before any horizontal distance at all.

**Those are measurements.** They are not a line-of-sight check, they are not a
clearance, and they do not say whether a flight is permitted. The app computes
the distance and shows it; the judgement is yours, because you are the one who
can see the site and the sky.

### The Part 107 night window

suncalc already solves for the six degrees of solar depression that 14 CFR
107.29 uses to define civil twilight, so the bands are drawn on the time axis
rather than described beside it:

| Band | Boundaries |
|---|---|
| Day | sunrise to sunset |
| Civil twilight | dawn to sunrise, and sunset to dusk |
| Night | before dawn, after dusk |

In **civil twilight and at night**, 107.29 requires anti-collision lighting
visible for three statute miles, and it may never be switched off in flight.
**Night** additionally requires the 107.65 night operations training. The two
have different boundaries on purpose: the lighting requirement starts at
sunset, the training requirement at dusk, and collapsing them into "night
rules" misstates both.

This exists because the app once reported a blue hour window of 18:44 to 18:53
and said nothing about lighting, when by its own numbers sunset was 18:27 and
dusk 18:53 — the whole window was inside civil twilight. The boundary was in
the arithmetic and not on the screen.

The bands state the rule and the computed boundary. They do not say whether a
flight is legal, cleared, compliant or permitted, and a test fails on those
words.

### Airspace and the LAANC path

The FAA publishes **UAS Facility Maps** and **Class Airspace** as keyless,
public domain feature services. This app bakes both into the repo rather than
querying them:

```bash
node scripts/bake-faa.mjs            # both layers
node scripts/bake-faa.mjs uasfm      # just the facility maps
node scripts/bake-faa.mjs airspace   # just the airspace
```

**Re-run it on the 56-day chart cycle.** The extract carries the effective date
it was cut from, and the Airspace panel prints whether that cycle is current or
superseded, so a stale bake announces itself instead of quietly answering with
last year's ceilings. `src/core/chartCycle.ts` is the arithmetic.

Baking rather than querying is a privacy decision before it is a performance
one. Every facility-map cell is a regular grid square, so the polygon geometry
carries nothing the row and column do not: strip it and the lookup is two
`Math.floor` calls against a table already in the bundle. No key, no account,
no request, and **the venue coordinate never leaves the device** because there
is nowhere for it to go. It also works with no signal, which is the condition a
site survey is actually conducted in.

Two things worth knowing if you re-bake:

- **The cells are half an arc-minute, not one.** They are commonly described as
  one arc-minute. 720 sampled geometries came back as quads measuring exactly
  0.5 x 0.5 arc-minutes. At one arc-minute the lookup merges each pair of cells,
  and 14.5% of the merged cells contain two different ceilings.
- **`LOWER_CODE = 'SFC'` is a datum, not a claim that the airspace touches the
  ground.** The service carries rows reading `LOWER_VAL 700` with
  `LOWER_CODE SFC` — Class E5 transition areas, which begin 700 ft up and need
  no Part 107 authorization. The surface test is both halves:
  `LOWER_VAL = 0 AND LOWER_CODE = 'SFC'`.

Against the altitude set on your air positions, the panel reports which path
the venue takes:

| The map says | Path |
|---|---|
| ceiling at or above your altitude | LAANC auto-approval, usually minutes |
| above it but the ceiling is not zero | Further Coordination, plan 90 days |
| ceiling zero, or no cell in the extract | manual DroneZone application |

With one correction the published rule misses: the route is read from the FAA's
own per-facility capability field, not inferred from the ceiling. **22,213 cells
carry a workable non-zero ceiling at a facility with no Part 107 LAANC route at
all.** The ceiling-only rule promises those "auto-approval, minutes" when the
real path is a manual application — wrong in the one direction that costs a
shoot day.

**None of it is an authorization.** The FAA's own words are that these maps do
not grant approval and are informational only, and the panel carries that.

### Terrain, and the sun in the sky

Satellite imagery draped over real elevation, from AWS's keyless Terrarium
tiles. Verified before it was wired, by decoding three tiles and checking them
against elevations known independently:

| | decoded | known |
|---|---|---|
| Skyline Drive, Shenandoah | 1027.4 m | ridge, about 1000 |
| Sandbridge beach | 1.1 m | sea level |
| Death Valley | −79.0 m | below sea level |

Death Valley matters more than it looks: terrarium stores elevation as
`(R × 256 + G + B/256) − 32768`, so a sign error reads it as +32689 m and every
ridge as a plateau. **The tiles are 256 px, not the 512 MapLibre's `raster-dem`
defaults to** — at the wrong size every slope is halved and nothing on screen
looks broken enough to notice.

**The sun is drawn in the sky at its real azimuth *and* altitude**, which is
the whole reason the terrain is worth having: an altitude has nowhere to live
on a flat map, where 8° and 48° produce the same ray. It moves as you scrub and
dims behind a ridge when the DEM says a ridge is in the way. The pitch ceiling
went from 60° to 85° because at 60° with MapLibre's 36.87° field of view the
horizon is still above the top edge — the old tilt had no sky to show.

**Terrain is suspended above zoom 15, and the layers list says so.** Measured
on a 4× CPU-throttled phone profile at venue zoom, rotating: 17.2 fps without
terrain, 3.2 fps with it, an 81% loss, heap 42 → 78 MB. Zoom 15 is the DEM's own
maxzoom, so above it the cost is the same and the detail is not. A 3D view that
silently flattens as you zoom in would be the kind of surprise this app is
supposed not to have.

**Generated plans are made from a flattened map, and say so.** The capture path
unprojects normalised image coordinates against the recorded camera, and with
terrain on that inversion is out by up to 57 px at capture resolution — hundreds
of metres of ground. Not a rounding error: MapLibre resolves elevation for
projection against state a render pass updates, and the inversion deliberately
draws no frame. So capture switches terrain off for the moment of the image,
which puts the round trip back to 0 px at every pitch and bearing, and the plan
carries a note saying the model never saw the hillside.

Buildings are OSM footprints extruded to their mapped heights. The heights are
the point rather than the look: they are the same input the shadow casting and
the sightline check need, so they are stored as data with their *source*
recorded, and a missing height stays `null` for the arithmetic while being drawn
as a visibly dimmer nominal box. An undrawn building is one nobody mapped, not
an empty lot.

### Landowner rules are not airspace rules

**No airspace layer will ever warn you about a National Park.** Shenandoah is
the case that made this worth writing down: the National Park Service bans
launching, landing and operating a drone anywhere inside park boundaries under
36 CFR 1.5. The airspace over Skyline Drive is largely Class G, so every
airspace source in this app — the facility maps, the Class Airspace extract,
the LAANC route — will correctly report that no ATC authorization attaches, and
every one of them is answering a different question from the one that stops you
flying there.

It is a **landowner** rule. So is a city park ordinance, a state park rule, a
private venue's own policy, and the wildlife closure on a beach in nesting
season. None of them are in any aeronautical dataset because none of them are
aeronautical.

If park or other land boundaries are added later they are labelled as a
**ground rule**, in their own section, never folded into the airspace answer.
An airspace panel that reported a Park Service ban as airspace would be
wrong twice: wrong about what the rule is, and wrong in a way that teaches you
to expect airspace data to cover things it has never covered.

**TFRs and NOTAMs are not checked.** There is no usable keyless public feed for
temporary flight restrictions and NOTAMs need OAuth2 client credentials, so
this app checks neither and says so where it cannot be missed. A TFR can close
the airspace with nothing above changing. Check
[tfr.faa.gov](https://tfr.faa.gov/) before you fly. An unchecked TFR and an
unmarked power line are the same class of lie.

Airspace and facility map data is published by the Federal Aviation
Administration. This project is not endorsed by or affiliated with the FAA,
uses no FAA seal or logo, and does not carry "FAA" in its name.

### Running the sun math backwards

The app can say where the sun is at a given time. It can also answer the
inverse: **what date and time does the sun sit on a given bearing from the
pin**, or behind a thing you tap. Optionally constrained by altitude, for light
low enough to rake across something.

Pure inversion of the suncalc already in the bundle — no new data and no
network. It looks for sign changes in the signed error and bisects them, rather
than scanning for samples that happen to fall inside the tolerance: the sun
moves about 15 degrees an hour, so a ten-minute step moves two and a half
degrees, and a tolerance scan misses narrow alignments entirely and gets
*worse* as you tighten the tolerance.

## Privacy

- No accounts and no sign in.
- No database. Nothing you enter is persisted server side.
- No analytics, no telemetry, no tracking, no third party scripts.
- Your venue notes, kit profile, saved spots, and uploaded screenshots stay in
  your browser. The kit profile and any spots you save go to `localStorage` on
  your own device. The venue form is session state and is not saved unless you
  save it as a spot.
- Saved spots never leave the device. There is no account and no sync. Export
  writes a JSON file you own and can put wherever you like, and import reads one
  back; that is the whole backup story, deliberately.
- **No model is called, and no AI key is needed.** Suggest works out positions
  in `src/core/suggest.ts`. AI is planned to return as bring-your-own-key,
  called from the phone with no server in between; until then there is none.
- **It never asks an IP address where you are.** Not on load, not as a fallback
  when you decline the browser's own location prompt, not for one frame. An
  approximate position derived from an IP address is user data, and the way not
  to hold it is not to ask for it. There is a test in the repo
  (`tests/noIpGeolocation.test.ts`) that fails the build if such a call, or a
  read of a platform's `x-vercel-ip-latitude` style header, ever appears.

**Where the map starts, and the one location button.** The app opens on a wide
view of the Atlantic, which is plainly asking rather than answering. It used to
open at street level on the venue it was calibrated against, in Salisbury
Maryland, which told everyone who opened it that they were standing in one
particular car park.

There is one **Use my location** button on that cold start, and it is the only
thing in the app that asks your operating system for a position. It asks when
you tap it and not before, so the permission prompt comes from something you
did. What comes back moves the map to roughly the right neighbourhood and is
then gone: it is not stored, not turned into the venue pin, and not sent
anywhere. If you decline, it says so once and the map stays wide.

The separate live position used in Field mode, for the walk-to line, is the same
deal: it runs only while Field mode is open and nothing is written down.

Several things leave your device, and you should know exactly what they are.

**Map tiles.** The satellite map fetches imagery from Esri at
`server.arcgisonline.com`. Requesting a tile tells that server which tile you
are looking at, so your venue coordinates are visible to Esri, at roughly the
zoom level you are viewing. That is unavoidable for any map that streams
imagery. Nothing else is attached: no account, no identifier, no form content.
Saving a venue for offline asks Esri and AWS for the tiles of the box around the
reach ring ahead of time: the same servers, the same kind of request, for the
place you already opened. Saved tiles are read back from this device.

**Our own two functions keep nothing in their URLs.** Venue search
(`api/search.ts`) and ground view (`api/streetview.ts`) take a POST with a JSON
body. Vercel keeps the request path of every function call in its logs, query
string included, so a coordinate or a place name in a URL would sit there; in a
body it does not. `tests/apiBodies.test.ts` reads the source and
`scripts/audit-api-urls.mjs` watches the running app's requests in the commit gate.

**Sky cameras: nothing leaves at all.** The camera list is a **file in this
repo**, `src/data/cams.ts`. There is no cam API, no key and no account, and
your venue coordinate never leaves the device: "which cameras are near me" is
answered locally against data already in the app bundle. Any camera service
would have required sending the venue somewhere, which is the thing this app
exists to avoid.

The app ranks them and offers a link. That is all. Nothing is embedded in an
iframe, nothing is proxied through our own function, no stream or manifest is
pulled for a thumbnail, and no frame is ever saved anywhere — including into an
offline field pack, which is the one place it would be most tempting. Tapping a
camera opens that operator's own site in a new tab, and from that point it is
between you and them. `tests/camsLinkOnly.test.ts` fails the build if any of
that changes.

### Adding a camera

Append an entry to `src/data/cams.ts`. Six fields, no build step, no coordinate
lookup service:

```ts
{
  id: 'my-pier-cam',                       // unique, stable, kebab-case
  name: 'My Pier',                         // what you'd call it
  at: { lat: 35.9570, lon: -75.6240 },     // read off any map; see below
  url: 'https://example.com/pier-cam/',    // the page a tap should open
  operator: 'My Pier',                     // whose site you land on
  access: 'free',                          // or 'paid'
},
```

A lat and lon off any map is fine. They are only used to rank by direction and
distance from your venue, where a few hundred metres changes nothing — a camera
is useful because it is twenty kilometres upwind, and twenty kilometres is not
sensitive to which end of a pier the camera is bolted to.

Two things to keep true: the URL must be `https`, and it must not carry a key
or a token, because this file is meant to be shared. The test checks both, plus
that ids and URLs are unique. **This is the easiest file in the project to
contribute to, and that is deliberate** — the list is seeded with the
mid-Atlantic coast because that is where it is used, not because that is where
it should end.

Every seeded URL was requested and returned 200 before being committed, except
the two Surfline pages: Surfline answers 403 to any automated request, so those
two could not be machine checked. They are marked `paid`.

**How they are ranked.** A camera downwind is showing weather that has already
gone past; a camera upwind is showing the next hour. So the list is upwind
first, then by how soon that weather arrives — and only the component *along*
the wind counts toward that, because weather travels along the wind rather than
toward you. A camera 18 km out but 60° off the wind is 15 minutes away, not 30.
In a calm there is no lead time at all and the list says so rather than
inventing one. Wind comes from Open-Meteo. Nothing is dropped: a downwind
camera is listed with its angle, so you can see why it is at the bottom.

**The sky layer, when you turn it on.** Tapping **Sky** overlays GOES-19
satellite cloud imagery on the map. The tiles come from **NASA GIBS** at
`gibs.earthdata.nasa.gov`, which reprojects and archives NOAA NESDIS imagery
and serves it as map tiles. Requesting a tile tells that server which tile you
are looking at, exactly like the Esri imagery above. No key, no account,
nothing else attached. It is **off by default**, so if you never tap it nothing
goes there.

The band is chosen for you from the sun's altitude, because visible light is
black before sunrise: above about 3° you get band 2 (visible, 1 km), below it
band 13 (longwave infrared, 2 km), which sees cloud by its temperature and so
works in the dark. The button says which one you will get. The colour key is
built from the colour table GIBS publishes for the layer — nothing in this app
writes down a colour or a temperature, because a legend invented from memory
would be a confident wrong answer about someone else's data.

**The layer follows the time bar, and splits honestly.** Scrub back and you get
the real GOES frame nearest that moment, with the frame's own timestamp shown
rather than the scrubber's. Scrub forward and there is no satellite image of
the future, so it switches to the Open-Meteo cloud forecast, drawn as coarse
hard-edged squares that cannot be mistaken for imagery and labelled
**FORECAST**. The two are never blended, and the key names the exact moment the
split falls on. A forecast is drawn fainter the further out it is and **not at
all past a week**, because a cloud map at that range would look just as
confident as one for tomorrow. Frames live in memory for the session only:
never written to storage, never put in a field pack.

**Wind.** Open-Meteo at `api.open-meteo.com`, the same keyless service the cloud
forecast already uses, gets the venue coordinate and returns wind speed,
direction and gusts for the hour. It is the same one coordinate that service
already receives.

**Venue search, and this one changed.** With a `MAPBOX_TOKEN` set, typing in the
search box sends what you type **to Mapbox, as you type it**. Not on submit: a
request goes out about 300ms after you stop typing, so a query you type in two
bursts is two requests. It goes through this app's own serverless function so
the token stays on the server, which means Mapbox sees the request coming from
the server rather than from your phone, and the function logs nothing. The map
centre goes with it, so nearby results rank first.

Be clear about the trade. **Mapbox is a company, not a nonprofit.** It is a
commercial geocoder with a privacy policy and a billing relationship, and OSM's
Nominatim is run by the OpenStreetMap Foundation. This is a real change in who
sees your searches, made because the OSM geocoders could not find the places
this tool is used at: "First Street Jetty Virginia Beach" returns **zero**
results from Nominatim, and small coastal place names fail the same way. A
search that cannot find the venue is a search that does not work.

It is deliberately not Google Places, which would have been the other obvious
choice. That would send every keystroke to Google and change the privacy stance
of this app much further than this does.

Billing is per *session*, not per keystroke: one token covers a whole typed
query plus the result you pick, so typing twenty characters is one charge.

**Without a `MAPBOX_TOKEN` nothing goes to Mapbox at all.** Search falls back to
Nominatim at `nominatim.openstreetmap.org` and Photon at `photon.komoot.io`,
both OpenStreetMap based, queried no more than once a second per their policy.
The dropdown names whichever one answered, so you can always see where a result
came from.

**Naming a pin.** A venue coordinate with no name of its own (a dropped or
dragged pin, a search result that came back unnamed, a shared plan with no name)
is sent to Nominatim's reverse lookup, to name it with something readable: the
place, or failing that its area ("Rudee Inlet, Virginia Beach"). Only the
coordinate is sent, at most once a second, and a failed lookup is asked again a
few times (after 5, 20 and 60 seconds, and when the network comes back). Until
a name arrives the top bar shows the coordinate. A named venue sends nothing.

**Is there a network?** When a request fails, the app asks its own origin for a
headers-only answer (`HEAD /`) before deciding anything. Offline is that check
failing twice; one source refusing (Overpass, the map tiles) never makes the
whole app say offline. Nothing about you or the venue is in that request.

**Site geometry.** Pressing Generate also asks Overpass, at
`overpass-api.de`, for the water, buildings, piers, roads, and parking inside the
current map view. That sends the bounding box you are looking at, nothing else.
Results are cached per view so repeated generates do not re-query, and if
Overpass is slow or down the app carries on without it.

**The place around a venue.** The buildings the 3D view draws (footprints with
their heights, within 600 m) and the sea the elevation is cleaned against, so
it sits at sea level in 2D and 3D, come from OpenFreeMap's map tiles at
`tiles.openfreemap.org` (`src/lib/vectorTiles.ts`). What goes there is tile
numbers around where the map is looking, the same thing the photograph and
elevation tiles already send to Esri and AWS: no key, no cookies. The tiles are
kept with a venue's saved area, so they work with no signal. If they cannot be
had, the 3D view says "Map data didn't load" with a Retry, and the elevation is
cleaned from its own shape instead.

The mapped single trees, which the tiles do not carry, still come from Overpass:
a box around the venue, sent once per venue and kept on the phone afterwards
(`src/lib/place.ts`). If Overpass does not answer, the 3D view still draws and
its legend says the trees did not load. Every Overpass request the app makes,
this one and the ones below, goes one at a time to `overpass-api.de`, and only
when that fails to `overpass.kumi.systems`, then `overpass.private.coffee`: three
public servers of the same OpenStreetMap data (`src/lib/overpassClient.ts`).

**Tide.** For a waterfront venue the app asks NOAA CO-OPS at
`api.tidesandcurrents.noaa.gov` for tide predictions. Your coordinates are **not**
sent: the full station list is fetched once, cached in `localStorage`, and the
nearest station is chosen on your own device, so NOAA sees only which station id
was requested and not where you are. That is deliberately a better position than
the map tiles, which do disclose the view. If the nearest station is more than
80km away the app says so and asks for nothing.

**Cloud.** Pressing "Cloud along the sightline" on a position card asks
Open-Meteo at `api.open-meteo.com` for cloud cover at five points along that
position's bearing, out to 80km. Those coordinates do leave the device, and
nothing is sent until you press it.

**Field pack, opt in and off by default.** Pressing "Prepare field pack" in Plan
fetches the ground view for *every* position at once, so all of their coordinates
go to Google's Street View API in one go, through the serverless function. It is
the only place in the app that sends coordinates in bulk, it never runs
automatically, and the button states what it will do before you press it. What it
caches, the computed values, the tide predictions and the photos, is written to
`localStorage` on your own device and is never uploaded. Without the press,
nothing is prefetched and Field mode falls back to fetching one photo at a time
as you swipe.

**Suggest.** Only when you press it. It reads the building footprints and their
heights from the map tiles, sends Overpass a bounding box around the reach ring
for the water and the rest of the site, and works out
every position on the device (`src/core/suggest.ts`). No image of the map and no
text goes anywhere: there is no model and no AI endpoint.

**Ground view, one position at a time, when you tap it.** Tapping a position in
Plan opens its card, and opening that card sends **that one position's
coordinate** to Google's Street View API, through a serverless function so the
key stays server side. It is the tap that sends it: no card open, nothing sent.
What goes is the latitude and longitude of that single position, the direction
the camera points, and how wide the lens is. No other position's coordinate goes
with it, and the venue itself is never sent to Google.

Each distinct view is fetched **once per session**. The result is held in memory,
keyed on exactly those four parameters, so reopening the same card shows the
photo it already has without asking Google again or billing a second image. Move
the position, or re-aim it, and it is a different photograph, so it is fetched
again. The memory cache is gone on reload; nothing about it is written to disk.

**The field pack is the only thing that sends coordinates in bulk.** Pressing
"Prepare field pack" fetches the ground view for *every* position at once. That
is the one place in the app where more than one position's coordinate leaves the
device in a single action, it never runs automatically, and the button says what
it will do before you press it.

Nothing at all is sent to Google if `GOOGLE_MAPS_API_KEY` is unset, which is the
default: the card simply says ground view is off. That function logs nothing
either.

Ground view shows real Street View imagery or it says plainly that there is
none. It never generates or illustrates a view. A plausible fake sightline is
worse than no sightline for a tool whose whole value is being right about a place
you have not seen.

Everything else stays put. There is no "us." There is no server holding your
data because there is no server holding anything.

## Stack

- Vite, React, TypeScript
- `maplibre-gl` for the map, over Esri World Imagery satellite tiles
- Mapbox Search Box API for venue search, when a token is set; Nominatim and
  Photon, both from OpenStreetMap, as the fallback and for naming a dropped pin
- OpenFreeMap vector tiles (OpenMapTiles schema), from OpenStreetMap, for
  building footprints with their heights and the sea
- Overpass, from OpenStreetMap, for real water, road and pier shapes, and trees
- Google Street View Static API for the optional ground view
- `suncalc` for solar position
- `tz-lookup` for the venue's timezone from its coordinates, offline
- NOAA CO-OPS for tide predictions, and Open-Meteo for cloud along the sightline.
  Both are free and keyless; all the arithmetic over them is in `src/core/`
- turf for bearings, distances, and destination points, as the seven scoped
  packages actually used rather than the `@turf/turf` barrel
- Vitest for the core tests

## Run it

Requires Node 20 or newer.

```sh
npm install
cp .env.example .env   # every key in it is optional
                       # GOOGLE_MAPS_API_KEY for ground view, MAPBOX_TOKEN for search
npm run dev
```

`npm run dev` is the fast loop. It prints a local URL and a LAN one, and runs
everything except Generate and Ground view: the map, search, the venue form, the
kit profile, the sun readout, the time scrubber, dragging positions. Vite does not
run serverless functions, so those two buttons tell you to switch rather than
failing silently.

**To run the app and the functions together, use `vercel dev`.** That is the one
command.

```sh
npm i -g vercel        # once
vercel dev             # app + functions, http://localhost:3000
```

`vercel dev` runs Vite as its dev command and serves `api/search.ts` and
`api/streetview.ts` alongside it at `/api/search` and `/api/streetview`, which
are the same paths production uses. No proxy config, no second port.

**It is already on your LAN.** `vercel dev` binds `0.0.0.0:3000` by default, and
Vite's `server.host: true` in `vite.config.ts` does the same for the underlying
dev server, so Vite prints the network address on startup:

```
➜  Local:   http://localhost:3000/
➜  Network: http://192.168.0.96:3000/  en0
```

Open that Network URL on the phone. Both the app and `/api/*` answer on it. Use
`--listen` only if you want a different port or a narrower bind:

```sh
vercel dev --listen 8080              # different port, still all interfaces
vercel dev --listen 127.0.0.1:3000    # localhost only, no phone access
```

The first `vercel dev` links the directory to a Vercel project and pulls that
project's environment variables. To skip linking and read variables from your
local `.env` instead, add `--local`:

```sh
vercel dev --local
```

```sh
npm run build     # typecheck and production build
npm run preview   # serve the production build
npm run lint      # oxlint
```

### Getting a Mapbox token

Five minutes, no card for the free tier. Mapbox's free allowance is generous for
one person planning shoots; search is billed per completed *session*, and this
app uses one session per typed query rather than one per keystroke.

1. Sign up at <https://account.mapbox.com/auth/signup/>.
2. Go to <https://account.mapbox.com/access-tokens/>.
3. You can use the **Default public token** that already exists on that page.
   Its default public scopes cover the Search Box API, which is all this app
   calls. Copy it; it starts `pk.`.
4. If you would rather create your own, click **Create a token**, give it a
   name, and leave the default public scopes ticked. You do **not** need any
   secret scope, and you do not need `downloads:read`.
5. Do **not** set an allowed-URL restriction. Those apply to requests made from
   a browser, and this app calls Mapbox from its own serverless function, so a
   URL restriction would reject every request.
6. Put it in `.env` as `MAPBOX_TOKEN=pk.…`, or for a deploy:
   `vercel env add MAPBOX_TOKEN production`.

The token is read only by `api/search.ts` and never reaches the browser bundle.

## Run the tests

```sh
npm test          # single run
npm run test:watch
```

The suite covers the whole computation core: azimuth conversion, the lighting
classifier including the wraparound cases, field of view, map geometry and the
field of view cone, timezone resolution across a daylight saving change, bearing
coverage, cloud along a sightline, tide interpolation and the nearest-station
bands, the kit profile, and a calibration case for a real venue where the correct
answer is already known.

## Deploy your own

ScoutNGo is bring your own key, and every key is optional. There is no hosted
instance, no account, and no key of ours to use; you fork it and deploy your own
copy.

Hosted on **Vercel**. The two functions, search and Street View, live in `api/`
and deploy automatically as Vercel Functions; the Vite app builds to `dist` and is
served as static files.

### What Vercel needs

Two environment variables, set in the Vercel dashboard under **Project → Settings →
Environment Variables**, for the Production, Preview, and Development environments you
care about. Never in `vercel.json`, which is committed and therefore public.

| Variable | Required | What it is |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | No | Enables the optional ground view on a position card, via `api/streetview.ts`. Leave it unset and the card says there is no ground view, in the same space; nothing else changes. |
| `MAPBOX_TOKEN` | No | Enables the better venue search, via `api/search.ts`. Leave it unset and search falls back to Nominatim and Photon. See "Getting a Mapbox token" below. |

Neither is prefixed `VITE_`, and that is deliberate: Vite only exposes `VITE_`
variables to the browser bundle, so a plain name cannot leak into client code even
by accident.

The Node version comes from `engines.node` in `package.json` (`>=20`), which Vercel
reads, so there is nothing to set for it.

`vercel.json` contains one key, `framework: "vite"`. Deployment would auto-detect
Vite without it, but `vercel dev` would not: with no framework configured the CLI has
no dev command, falls through to a build path that shells out to yarn, and fails on a
machine that only has npm. Nothing else needs configuring — the Vite preset already
gives `npm run build` into `dist`, the default function timeout is 300s against a
generate call that measures under 10, and there is no client side router to need a
rewrite rule.

`.env` is for local development only. It is gitignored, has never been committed, and
is not read by Vercel's build; the deployed site reads the variables above from
Vercel's own store.

### Fork it and deploy

These are the commands, start to finish. **Run them yourself** — read each one first,
and check `git status` before the first push so you know exactly what is going up.

```sh
# 1. Confirm nothing secret is staged. .env must NOT appear in this list.
git status
git ls-files | grep -i env      # should print only .env.example

# 2. Commit the working tree.
git add -A
git commit -m "ScoutNGo"

# 3. Create a PUBLIC repo on GitHub and push. Requires the gh CLI, logged in
#    with `gh auth login`. Change the name if you want a different one.
gh repo create scoutngo --public --source=. --remote=origin --push

# 4. Link this directory to a Vercel project. Requires the Vercel CLI:
#    npm i -g vercel && vercel login
vercel link           # choose your scope, then "Create a new project"
                      # it reads vercel.json and detects Vite, so accept
                      # the build command (npm run build) and output dir (dist)

# 5. Set any optional keys. Each command prompts for the value, so the key is
#    never typed into your shell history.
vercel env add GOOGLE_MAPS_API_KEY production   # optional, skip for no ground view
vercel env add MAPBOX_TOKEN production          # optional, skip for OSM search

# 6. Deploy to production.
vercel deploy --prod
```

Step 3 makes the repository **public**. The code is MIT and contains no secrets, but
that is the step that cannot be undone quietly, so run it knowing that.

After step 6 the CLI prints the live URL. Open it on a phone and use the browser's
Add to Home Screen to get the standalone app.

Connecting the GitHub repo to Vercel through their dashboard instead of `vercel link`
gets you a deploy on every push, with preview deployments per branch; either way the
environment variables in step 5 still have to be set, in the dashboard or with
`vercel env add`. If you set them after a deploy has already run, redeploy — Vercel
bakes the environment into each build.

## Status

Working end to end. Press Generate and the app pulls real land and water shapes
from Overpass, sends those plus the current map view and your context to the
model, and gets back camera positions as normalized image coordinates. The app
converts those to real coordinates, then computes the bearing, the field of view
cone, and the lighting for each one itself.

Every position is then checked against the same OSM geometry. One that lands in
a river or on a road centreline is flagged in magenta on the map and in the shot
list. It is never moved for you: you can see the problem and drag it somewhere
you judge to be standable.

A time scrubber runs the whole window. Dragging it recomputes the sun and
re-lights every position live, so a four hour window flipping from backlit to
front-lit is something you watch happen.

The brief is anchored to the coordinate it was written about. Move the venue
more than 500m away and the app says so and refuses to generate until you either
clear the brief or confirm it still applies, because planning the old event at
the new place is worse than planning nothing.

Not built, and deliberately: depth of field, exposure, and hyperfocal tools; 3D
building meshes; accounts; any server side storage.

## License

MIT. See [LICENSE](LICENSE).
