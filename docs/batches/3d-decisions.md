# Batch 3D · decisions

Each section keeps its own heading; add yours under a new one.

## Section 1 · code review

The phone's facts (17 Nov, iPhone 13 Pro Max, iOS 18.7.8, build 62899a6):
"3D didn't load · Back to 2D", then "Loading the 3D view…" stuck, then a
reload out of memory, then "A problem repeatedly occurred"; Fly said "Not
open in 3 s". Playwright's WebKit passes. The probe (`/?probe=webgl`) is the
phone's answer; until Jwilly runs it, everything below is what the code and
the Mac's WebKit show, ranked by how much of the phone's story it explains.

The WebKit run of the probe: measurements/2026-11-17-webgl-probe-webkit.md
(WebKit 27.2, the Mac's GPU through ANGLE-Metal, the gate's fixture proxy).
All 25 steps pass there; step 25, a note, fails.

### 1. The 3D view is not shown until every tile of every ring is in (explains "3D didn't load" and "Not open in 3 s")

- `src/three/world/scene.ts:601` `const loaded = () => pending.n === 0 && ground.ready()`:
  the view is `shown` (and the canvas made visible, `clay--shown`) only when
  NOTHING is in flight: the near square (`src/three/world/ground.ts:38`,
  16 x 16 tiles at z18), the mid ring (z15, 4.5 km) and the far ring (z12,
  24 km) (`ground.ts:296-297`), the water tiles, the woods, the decks.
- At the pier the VB imagery source answers PNG, and every PNG tile also
  fetches Esri's underneath (`src/three/world/sources.ts:201`): two requests
  a picture.

MEASURED in WebKit at the pier, one view's ground alone: 409 pictures and 983 requests; the whole 3D view, 859 requests, shown at 4009 ms through a proxy on the same machine; first frame drawn at 80 ms (measurements/2026-11-17-webgl-probe-webkit.md).

- `src/lib/clayStatus.ts:16` CLAY_LOAD_MS is 10 s and `:18` FLY_LOAD_MS is
  3 s, both measured against `shown`. Over a phone network nine hundred
  requests in ten seconds is unlikely, so the phone's FIRST message is the
  expected one with working graphics. Not proven on the phone: the probe's
  steps 21 and 24 print the request count and the times there.
- Fixed for Fly (1.3, below). For the 3D view NOT changed: what `shown`
  waits for is a product call (show the near square first and let the rings
  fill in?). Recommended once the phone's step 24 numbers are in.

### 2. Closing the view does not stop its tile work (fits "stuck", then "out of memory")

- `src/three/world/ground.ts:276` each ring tile is `void working(async () => …)`;
  `dispose()` (`ground.ts:494`) frees what is already built but nothing
  stops the jobs in flight, and `bytes()` (`sources.ts`) gives `loadTile` an
  AbortController nobody aborts. A view closed while loading keeps fetching,
  decoding (256 KB a picture) and building OffscreenCanvas textures for a
  scene that is gone; "Back to 2D" and 3D again starts the next view's
  requests on top. Code-proven; the memory it costs on the phone is not
  measured. Not fixed (needs an abort through ground, water, woods, decks).

### 3. Throwaway WebGL contexts push the live ones out (fixed)

- `src/lib/webgl.ts` (before): `hasWebGL2()` made a new WebGL 2 context on
  every call and dropped it. Called on 3D open AND close
  (`src/components/PlanMode.tsx:729`), Fly (`:1270`), Preflight play
  (`:1321`), Stand here (`:2005`), Line up (`:2674`).

MEASURED in WebKit: a context made first was lost at throwaway 17 (probe step 25), and with contexts kept alive the first was lost when 17 were live; WebKit's console: "There are too many active WebGL contexts on this page, the oldest context will be lost." (measurements/2026-11-17-webgl-probe-webkit.md).

- The oldest live context on the app's page is the 2D map's (MapLibre,
  `src/components/MapView.tsx:1559`) or the app's one 3D renderer. Whether
  the garbage collector freed the throwaways in time on the phone is
  unknown; nothing made sure.
- Fix: asked once, the answer kept, the context lost on purpose at once.
  Test: tests/flyOwnStart.test.ts ("hasWebGL2 asks once and gives its
  context back").

### 4. What the phone refused went nowhere it could be read (fixed)

- A WebGLRenderer that throws ("Error creating WebGL context") reached
  Clay3D's catch and the pill only; a shader that failed went to
  `console.error` only (three.js's default). Neither reached Settings › Debug ›
  Last errors.
- Fix: `src/three/world/sharedRenderer.ts` logs a refused context
  (`GraphicsRefused`) and every shader's compile and link log
  (`renderer.debug.onShaderError`) with `recordError`; Clay3D logs any other
  start failure. Test: tests/flyOwnStart.test.ts.

### 5. Fly waited on the whole 3D view (fixed, 1.3)

- `src/components/Clay3D.tsx` (before): `flying = fly !== null && shown && …`.
  `shown` waits for every tile (finding 1) and the scene's own cap is
  `SHOW_WITHIN_MS` 30 s (`scene.ts:64`), against FLY_LOAD_MS 3 s. With the
  context refused, the same 3 s card, "Keep waiting" and all.
- Fix: Fly's own minimal start (`flyGate`, `src/lib/clayStatus.ts`): the
  scene made, its first frame drawn (`whenDrawn`, new in scene.ts), the
  take-off ground read. The pictures fill in as it flies. A context refused
  or lost: "Fly didn't open · Needs 3D graphics this phone didn't allow" at
  once, with Back. Tests: tests/flyOwnStart.test.ts.

### 6. A context lost is rebuilt with no limit (not fixed)

- `src/components/Clay3D.tsx:255`: lost, then rebuilt after 3 s on a new
  context, every time, with no count. If iOS takes the context for memory,
  the rebuild asks for the same memory again: a loop that fits "stuck, then
  reloaded, then A problem repeatedly occurred". Each loss is logged
  ("WebGL context lost"), so the phone's Last errors will say whether it
  happened. Recommended: stop after the second loss in one view and offer
  Back to 2D. Not done without that evidence.

### 7. Shaders: nothing iOS's ANGLE-Metal is known to reject

Checked against the list in the batch:

- loops: all constant-bounded (`clouds.ts:44` five octaves, `clouds.ts:102`
  `const int STEPS = 22` with a `break`, `sky.ts:101` twelve looks); no
  dynamic indexing of arrays; no integer arithmetic beyond loop counters.
- `texture2D(map, vUv, 0.5)` with a bias (`look.ts:91`): fragment-only,
  legal in GLSL ES 1.00 and 3.00. `dFdx`/`fwidth` (`look.ts:104`,
  `water.ts`): core in WebGL 2. `float lod;` (`water.ts:70`): a global
  without initializer, legal.
- Uniforms, varyings, samplers: the largest program has 26 active
  uniforms (the walls) against 1024 vectors; a handful of samplers a
  program against 16 units (probe step 3 prints the phone's limits).
- No float or half-float render target, no `RawShaderMaterial`, no
  `textureLod`, no Uint32 index buffer beyond what WebGL 2 always allows.
- WebKit (same ANGLE translator as iOS) compiled and linked all 13 programs
  and the scene's own 6 (probe steps 4-16, 24). The Metal compile behind it
  can still differ by GPU family: the phone's steps 4-16 settle it.

### 8. Contexts, buffers and sizes

- One three.js renderer for 3D, Fly, Compare and the sky pictures
  (`sharedRenderer.ts`), `antialias: true`, `preserveDrawingBuffer: false`,
  pixel ratio 1.5 on iOS: about 0.9 Mpx x 4 samples, by our own count inside
  the 94 MB the probe reports.
- The 2D map stays alive under the 3D view with `preserveDrawingBuffer: true`
  (`MapView.tsx:1661`) at the phone's full pixel ratio (3 on this iPhone): a
  second full-screen drawing buffer the app's GPU count does not include.
  The drone page's airspace map is a third MapLibre context
  (`src/components/DroneAirspace.tsx:161`). Not measured on the phone.
- No OffscreenCanvas WebGL and no worker in the 3D path; the ground tiles
  upload OffscreenCanvas 2D pictures (`ground.ts:279`), which WebKit took
  (probe step 19). Playwright's WebKit is 27.2, newer than iOS 18.7's, so
  the phone's step 19 is the one that counts.
- Textures: the near picture is 1024 px on iOS (lite), MAX_TEXTURE_SIZE
  16384 in WebKit.

### What is not proven

The phone has not run the probe. Findings 1, 2, 6 and the MapLibre buffer
are what the code does, not what the phone did. Next: Jwilly opens
`/?probe=webgl` once and sends the screenshot (or Copy all), and reads out
Settings › Debug › Last errors.

## Section 3

### 3.1 The surf boundary rule (Batch FIX 3.2): dropped

Jwilly approved dropping it. `callBand` and `BOUNDARY_FT` are gone; the band
is the centre's own (`surfBand`) everywhere. Kept from d9f5f4b: the chop rule,
one surf series, the bigger-swell watch. Table:
`measurements/2026-11-17-surf-noboundary.md` (13 Nov 12:30 VB and Croatan are
0–1 again; 14 Nov 4:30 PM VB goes back to 0–1 against a truth of 1–2, the
miss the rule was written for).

### 3.2 Which wave models, and how the chip combines them

**Models.** Options:

1. ECMWF WAM, GFS-Wave, Météo-France MFWAM, each at its single Open-Meteo id
   (`ecmwf_wam025`, `ncep_gfswave025`, `meteofrance_wave`).
2. The same three, with GFS-Wave asked at both grids (`ncep_gfswave016`, the
   0.16° Atlantic grid, then `ncep_gfswave025`) and read from the first whose
   cell is sea.
3. Add DWD EWAM/GWAM or the ECMWF WAM ensemble.

Checked live on 17 Nov against marine-api.open-meteo.com: all four ids are
accepted. At 37.00,-76.00 (where VB, Croatan and Lynnhaven snap)
`ncep_gfswave025` answered **0.00 m for every hour of the week** (a
land-masked cell, a zero, not a null), while `ncep_gfswave016` read up to
1.92 m. At Wrightsville (34.25,-77.75) `ecmwf_wam025` answered null for every
hour. ECMWF WAM gives the whole sea only (no swell / wind-sea split).

**Pick: 2.** Option 1 would carry a false 0 ft "GFS-Wave" reading at every VB
spot. Option 3 adds request weight for models outside the approved list. A
model's cell counts as sea only when some wave height is above 0
(`seaInCell`); otherwise the model is left out rather than read as flat.

**How the chip combines them.** Options: (a) any one model ≥ 4 ft; (b) two
or more models ≥ 4 ft; (c) the mean of the models ≥ 4 ft. The approved rule
is (a): any model ≥ 4 ft at the beach within 7 days, on a day called ≤ 2 ft.
Each model is read the same way as the best match (part by part where it
splits the sea, the whole sea as one always, the same transform, 5 AM to
8 PM local), and the existing `swellWatch` rule runs over all the readings.
The words stay "Possible bigger swell Mon · models disagree · low confidence":
no size, no time.

**Where it is asked.** One extra request to the same host. The weather audit
holds the page load to 5 requests and was at 5 on its last measurement
(measurements/2026-11-02-weather-requests-batch-h-after.md), so the request
is not made on the home's first page. It is made by the Surf page, and by the
home once its Week page (where the chip shows) has been on screen. The
per-model daily log (`scoutngo.swellWatch.v1`, a `models` column per row) is
written when one of those screens is open that day. A later write that day
from a screen that did not ask the models keeps the models already logged.
The tradeoff: a day on which neither the Surf page nor the Week is opened
logs no per-model row.
