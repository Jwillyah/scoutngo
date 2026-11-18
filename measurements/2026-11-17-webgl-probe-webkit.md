# The WebGL probe in Playwright's WebKit, 2026-11-17

Written by `scripts/measure-webgl-probe.mjs` (Batch 3D, Section 1.1).

## Parameters

- page: http://127.0.0.1:5290/?probe=webgl (the built dist/, served by scripts/gate/server.mjs)
- browser: Playwright WebKit 27.2, device "iPhone 13" (Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1), viewport 390 x 844, service workers blocked
- network: every request through the fixture proxy http://127.0.0.1:5291; hosts asked in this run (the proxy's ledger): tiles.openfreemap.org 190, server.arcgisonline.com 882, s3.amazonaws.com 151, vginmaps.vdem.virginia.gov 776
- run took 24 s; screenshot /private/tmp/claude-501/-Users-jordanwilliams-Projects-scoutngo/00b79a51-e95d-4318-8bfb-a7941092a466/scratchpad/3d/probe-webkit-390x844.png
- the machine: a Mac (Apple GPU through ANGLE-Metal, no iOS memory limit). NOT the phone.

## The probe's own text (Copy all)

```
ScoutNGo WebGL probe · build 62899a6+ · 2026-11-18T01:57:14.177Z
Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.2 Mobile/15E148 Safari/604.1
ALL PASSED

1. PASS  WebGL 2 context (WebGL 1 tried if not) (5 ms): WebGL 2.0, WebGL GLSL ES 3.00; antialias true
2. NOTE  GPU name (UNMASKED_RENDERER) (0 ms): Apple GPU (Apple Inc.)
3. PASS  Limits (MAX_TEXTURE_SIZE and the rest) (45 ms): MAX_TEXTURE_SIZE 16384, RENDERBUFFER 16384, fragment uniform vectors 1024, vertex uniform vectors 1024, varyings 30, texture units 16, samples 4; this phone's 3D level lite, near picture 1024 px
4. PASS  Shader: Ground, Real look (world/look.ts) (332 ms): compiled and linked, 22 uniforms
5. PASS  Shader: Ground, Animated look (world/look.ts) (191 ms): compiled and linked, 11 uniforms
6. PASS  Shader: Sky, sun glow, stars, shafts (world/sky.ts) (8 ms): compiled and linked, 19 uniforms
7. PASS  Shader: Clouds, raymarched layer (world/clouds.ts) (5 ms): compiled and linked, 17 uniforms
8. PASS  Shader: Water surface (world/water.ts) (9 ms): compiled and linked, 24 uniforms
9. PASS  Shader: Shore ribbon (world/water.ts) (4 ms): compiled and linked, 10 uniforms
10. PASS  Shader: Building walls with windows (world/buildings.ts) (173 ms): compiled and linked, 26 uniforms
11. PASS  Shader: Building roofs (world/buildings.ts) (7 ms): compiled and linked, 12 uniforms
12. PASS  Shader: Lambert, flat shaded (woods, Animated walls) (88 ms): compiled and linked, 18 uniforms
13. PASS  Shader: Standard (decks, the drone) (279 ms): compiled and linked, 21 uniforms
14. PASS  Shader: Basic, see-through (the 400 ft ceiling) (53 ms): compiled and linked, 7 uniforms
15. PASS  Shader: Sprite (pins, cloud puffs, hour pills) (81 ms): compiled and linked, 12 uniforms
16. PASS  Shader: Lines (sun and moon arcs, outlines) (4 ms): compiled and linked, 7 uniforms
17. PASS  Textures 1024² and 2048² (12 ms): 1024² ok, 2048² ok
18. NOTE  Float render target (not used by the 3D view) (0 ms): float: complete; half float: complete
19. PASS  OffscreenCanvas picture into a texture (as the ground tiles do) (14 ms): canvas and transferred bitmap both upload
20. PASS  One three.js scene drawn (43 ms): 3 frames, the middle pixel rgb(149, 96, 16); drawing buffer 585 × 1266
21. PASS  3D: the terrain only (4017 ms): every tile in at 3995 ms, the near square drawn at 3961 ms; 409 pictures and 41 terrain tiles from 983 requests; 194 frames, slowest 34 ms; 29 textures, 28 geometries, 61 MB on the GPU by our count
22. PASS  3D: + the buildings (4083 ms): 302 buildings; 240 frames, slowest 30 ms; 29 textures, 38 geometries, 62 MB on the GPU by our count
23. PASS  3D: + the sky, the water and raymarched clouds (6064 ms): drawn; overview 180 frames, slowest 24 ms; low and level 178 frames, slowest 52 ms; cloud layers drawn; 37 textures, 57 geometries, 62 MB on the GPU by our count
24. PASS  The 3D view as the app opens it, then a Fly view (7022 ms): first frame at 80 ms, shown at 4009 ms (by tiles) after 859 requests; 6 programs, all linked; 184 + 56 frames kept, slowest 56 ms; 94 MB by our count, level lite, pixel ratio 1.5
25. NOTE  A kept context survives 20 throwaway ones (690 ms): Error: the kept context was lost at throwaway 17: unreleased contexts push the 3D view's out
```

## The live-context limit

One WebGL 2 context made first, then 24 more kept alive, 20 ms apart: the first was lost when 17 contexts were live.
WebKit's console said: "There are too many active WebGL contexts on this page, the oldest context will be lost."

## Console errors and warnings on the probe page

- error: There are too many active WebGL contexts on this page, the oldest context will be lost.
- error: There are too many active WebGL contexts on this page, the oldest context will be lost.
- error: There are too many active WebGL contexts on this page, the oldest context will be lost.
- error: There are too many active WebGL contexts on this page, the oldest context will be lost.
- error: There are too many active WebGL contexts on this page, the oldest context will be lost.
