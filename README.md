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
- Nominatim, from OpenStreetMap, for venue search
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
| `ANTHROPIC_API_KEY` | Yes | Your Anthropic key, from <https://console.anthropic.com>. Read only by `api/generate.ts`, so it never reaches the browser bundle. Without it, Generate returns a plain message naming the missing variable. |
| `GOOGLE_MAPS_API_KEY` | No | Enables the optional ground view on a position card, via `api/streetview.ts`. Leave it unset and the card says ground view is off; nothing else changes. |

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
