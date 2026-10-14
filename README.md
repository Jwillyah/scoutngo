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
- Tide from NOAA, and the time scrubber that moves every one of those numbers
- Shot lists, saved setups, the kit editor, Field mode, offline field packs
- Installing it to your home screen and using it as an app

**Three optional keys, each adding one thing.** Everything above keeps working
without them, and anything that needs one says so in a line where the feature
would be, rather than failing:

| Key | Adds | Without it |
| --- | --- | --- |
| `MAPBOX_TOKEN` | Better venue search, autocompleting as you type | Search falls back to OpenStreetMap's Nominatim and Photon, which are good at addresses and weaker on coastal landmark names |
| `ANTHROPIC_API_KEY` | "Suggest positions", and reading a typed description into the form | Place positions by hand and fill the fields in yourself |
| `GOOGLE_MAPS_API_KEY` | A Street View photo on each position card | The card says there is no ground view, in the same space |

**No key is ever required for the primary action on any screen.** Suggesting
positions is a secondary control beside "Add position", and it is labelled
optional.

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

**There is no service worker, deliberately.** Offline is not a goal yet. The only
thing worth caching for a venue is satellite imagery, which runs to hundreds of
megabytes at usable zoom and would sit in device storage indefinitely for a venue you
visited once. When offline becomes a goal it should cache one venue you asked for, not
every tile that scrolled past.

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
- Bring your own Anthropic API key. It goes in `.env`, which is gitignored, and
  is read only by a serverless function so it never reaches the browser bundle.
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

Three things leave your device, and you should know exactly what they are.

**Map tiles.** The satellite map fetches imagery from Esri at
`server.arcgisonline.com`. Requesting a tile tells that server which tile you
are looking at, so your venue coordinates are visible to Esri, at roughly the
zoom level you are viewing. That is unavoidable for any map that streams
imagery. Nothing else is attached: no account, no identifier, no form content.

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

**Naming a dropped pin.** Dropping or dragging the venue pin sends that one
coordinate to Nominatim's reverse lookup, to fill the venue name with something
readable. Only the coordinate is sent, at most once a second, and only while the
name is still one the app filled in; once you type a name, moving the pin sends
nothing. If the lookup fails the name reads "Dropped pin" and nothing waits on it.

**Site geometry.** Pressing Generate also asks Overpass, at
`overpass-api.de`, for the water, buildings, piers, roads, and parking inside the
current map view. That sends the bounding box you are looking at, nothing else.
Results are cached per view so repeated generates do not re-query, and if
Overpass is slow or down the app carries on without it.

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

**Plan generation.** Only when you press Generate, and only then. That request
carries a JPEG of the current map view plus your text context and the site
geometry, and it goes to Anthropic through the serverless function so your key
stays out of the browser. The function logs nothing at all, stores nothing, and
writes to no database: `api/generate.ts` says so at the top and explains why.
Vercel retains function logs in its dashboard, which is precisely why nothing is
ever written to them.

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
- Overpass, from OpenStreetMap, for real water, building, road and pier shapes
- Google Street View Static API for the optional ground view
- `suncalc` for solar position
- `tz-lookup` for the venue's timezone from its coordinates, offline
- NOAA CO-OPS for tide predictions, and Open-Meteo for cloud along the sightline.
  Both are free and keyless; all the arithmetic over them is in `src/core/`
- turf for bearings, distances, and destination points, as the seven scoped
  packages actually used rather than the `@turf/turf` barrel
- Vitest for the core tests
- Anthropic API through a Vercel Function, so the key is not in the browser. The
  model is `claude-sonnet-5`, named once at the top of `api/generate.ts` alongside
  the token cap and the effort level

## Run it

Requires Node 20 or newer.

```sh
npm install
cp .env.example .env   # then paste in your own Anthropic key
                       # GOOGLE_MAPS_API_KEY is optional, for ground view
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

`vercel dev` runs Vite as its dev command and serves `api/generate.ts` and
`api/streetview.ts` alongside it at `/api/generate` and `/api/streetview`, which
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

ScoutNGo is bring your own API key. There is no hosted instance, no account, and no
key of ours to use; you fork it, deploy your own copy, and it talks to Anthropic with
your key from your own serverless function.

Hosted on **Vercel**. The two functions live in `api/` and deploy automatically as
Vercel Functions; the Vite app builds to `dist` and is served as static files.

### What Vercel needs

Two environment variables, set in the Vercel dashboard under **Project → Settings →
Environment Variables**, for the Production, Preview, and Development environments you
care about. Never in `vercel.json`, which is committed and therefore public.

| Variable | Required | What it is |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | No | Your Anthropic key, from <https://console.anthropic.com>. Read only by `api/generate.ts`, `api/parse.ts` and `api/event.ts`, so it never reaches the browser bundle. Without it, "Suggest positions" says in one line that it needs a key, and you place positions by hand. |
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

# 5. Set your keys. Do this BEFORE the first production deploy, or the first
#    Generate will fail with the missing-key message. Each command prompts for
#    the value, so the key is never typed into your shell history.
vercel env add ANTHROPIC_API_KEY production
vercel env add ANTHROPIC_API_KEY preview
vercel env add GOOGLE_MAPS_API_KEY production   # optional, skip for no ground view

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
