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

## Privacy

- No accounts and no sign in.
- No database. Nothing you enter is persisted server side.
- No analytics, no telemetry, no tracking, no third party scripts.
- Your venue notes, kit profile, and uploaded screenshots stay in your browser.
  The kit profile is saved to `localStorage` on your own device. The venue form
  is session state and is not saved anywhere at all.
- Bring your own Anthropic API key. It goes in `.env`, which is gitignored, and
  is read only by a serverless function so it never reaches the browser bundle.

Three things leave your device, and you should know exactly what they are.

**Map tiles.** The satellite map fetches imagery from Esri at
`server.arcgisonline.com`. Requesting a tile tells that server which tile you
are looking at, so your venue coordinates are visible to Esri, at roughly the
zoom level you are viewing. That is unavoidable for any map that streams
imagery. Nothing else is attached: no account, no identifier, no form content.

**Venue search.** Typing in the search box sends that text to Nominatim at
`nominatim.openstreetmap.org`, run by the OpenStreetMap Foundation. They see the
query and, as with any web request, your IP and the referring page. Only what you
type in that box is sent. If you would rather not search, drop the pin by hand or
type coordinates; nothing is sent then.

**Site geometry.** Pressing Generate also asks Overpass, at
`overpass-api.de`, for the water, buildings, piers, roads, and parking inside the
current map view. That sends the bounding box you are looking at, nothing else.
Results are cached per view so repeated generates do not re-query, and if
Overpass is slow or down the app carries on without it.

**Plan generation.** Only when you press Generate, and only then. That request
carries a JPEG of the current map view plus your text context and the site
geometry, and it goes to Anthropic through the serverless function so your key
stays out of the browser. The function logs nothing at all, stores nothing, and
writes to no database: `netlify/functions/generate.ts` says so at the top and
explains why.

**Ground view, opt in and off by default.** A position card has a Ground view
button. Pressing it sends that one position's coordinates to Google's Street
View API, through a serverless function so the key stays server side. Nothing is
sent until you press it, and nothing at all is sent if `GOOGLE_MAPS_API_KEY` is
unset, which is the default: the card simply says ground view is off. That
function logs nothing either.

Ground view shows real Street View imagery or it says plainly that there is
none. It never generates or illustrates a view. A plausible fake sightline is
worse than no sightline for a tool whose whole value is being right about a place
you have not seen.

Everything else stays put. There is no "us." There is no server holding your
data because there is no server holding anything.

## Stack

- Vite, React, TypeScript
- `maplibre-gl` for the map, over Esri World Imagery satellite tiles
- Nominatim, from OpenStreetMap, for venue search
- Overpass, from OpenStreetMap, for real water, building, road and pier shapes
- Google Street View Static API for the optional ground view
- `suncalc` for solar position
- `@turf/turf` for bearings, distances, and destination points
- Vitest for the core tests
- Anthropic API through a Netlify serverless function, so the key is not in the
  browser

## Run it

Requires Node 20 or newer.

```sh
npm install
cp .env.example .env   # then paste in your own Anthropic key
                       # GOOGLE_MAPS_API_KEY is optional, for ground view
npm run dev
```

`npm run dev` prints a local URL and runs everything except Generate: the map,
search, the venue form, the kit profile, the sun readout, dragging positions.

Generate goes through a serverless function, and Vite does not run those. For
that you need the Netlify dev server, which runs the site and the function
together:

```sh
npx netlify dev
```

That serves the app on <http://localhost:8888>. The function is at
<http://localhost:8888/.netlify/functions/generate>. It reads `ANTHROPIC_API_KEY`
from your `.env`. If you press Generate under `npm run dev` instead, the app
tells you to switch rather than failing silently.

```sh
npm run build     # typecheck and production build
npm run preview   # serve the production build
npm run lint      # oxlint
```

## Run the tests

```sh
npm test          # single run
npm run test:watch
```

The suite covers the whole computation core: azimuth conversion, the lighting
classifier including the wraparound cases, field of view, map geometry and the
field of view cone, the kit profile, and a calibration case for a real venue
where the correct answer is already known.

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

Not built, and deliberately: depth of field, exposure, and hyperfocal tools; 3D
building meshes; accounts; any server side storage.

## License

MIT. See [LICENSE](LICENSE).
