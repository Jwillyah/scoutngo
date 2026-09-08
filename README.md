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

Two things do leave your device, and you should know exactly what they are.

**Map tiles.** The satellite map fetches imagery from Esri at
`server.arcgisonline.com`. Requesting a tile tells that server which tile you
are looking at, so your venue coordinates are visible to Esri, at roughly the
zoom level you are viewing. That is unavoidable for any map that streams
imagery. Nothing else is attached to those requests: no account, no identifier,
no form content. If a venue location is sensitive, do not point the map at it.

**Plan generation.** Only when you press generate, and only then. That request
goes to Anthropic, not to us.

Everything else stays put. There is no "us." There is no server holding your
data because there is no server holding anything.

## Stack

- Vite, React, TypeScript
- `maplibre-gl` for the map, over Esri World Imagery satellite tiles
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
npm run dev
```

The dev server prints a local URL. The map, the venue form, the kit profile, and
the sun readout all work without a key. Only plan generation needs one.

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

Early. The computation core, the live satellite map, and the setup form exist.
Camera positions are hardcoded stubs around the calibration venue so the shooter
figures, the field of view cones, and the lighting colors can be seen on real
imagery. Their geometry is real: bearings, cone angles, and lighting classes are
all computed by `src/core/`. Plan generation is not wired up yet.

## License

MIT. See [LICENSE](LICENSE).
