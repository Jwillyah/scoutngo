# Wind layer, phase B: wind as image tiles (proposal, not built)

Batch Map, Section 1 asked for phase A now and phase B proposed.

## Phase A (built, 9 Nov)

The phone asks for the wind over what is on screen in fixed blocks of 25
grid points (`src/core/windViewport.ts`): 0.25° apart from zoom 6 to 9,
0.05° from zoom 9, wider when far out, at most 9 requests a view. Every
block goes through `/api/forecast`, so the CDN keeps one copy per block
per hour for every phone, and a request names only the block's fixed
points. Nothing in it is the user's position, but the view is: someone
reading Vercel's request log could see which coast a phone looked at.

## Phase B: tiles from a scheduled job

Make the wind a set of static image tiles, so that the phone downloads
pictures by z/x/y and sends no coordinates of any kind.

1. **A job every hour** (GitHub Actions on a schedule, or a small worker)
   downloads the global GFS 0.25° 10 m wind (u, v; NOAA NOMADS, public, about
   15 MB a cycle for the two fields) and HRRR 3 km for the US (about 40 MB).
   It runs as soon as each cycle lands: GFS 4 times a day, HRRR hourly.
2. **It encodes u and v into PNG tiles**: red = u, green = v, scaled to
   ±40 m/s, blue = gust. These are the same tiles Windy-style particle
   layers read, at z0 to z6 for GFS and to z8 for HRRR, for the next 72
   hours in 3-hour steps (GFS) or hourly steps (HRRR).
3. **The tiles are stored as static files** on a host with a CDN. The phone
   asks `/wind/{model}/{run}/{hour}/{z}/{x}/{y}.png` and decodes the pixels
   into the same field the layer draws now (`sampleField` reads a field
   from tiles instead of points). The colour field and the particles do not
   change.

### What hosting it needs

- **Size:** GFS z0 to z6 is 5,461 tiles a step. Each is about 6 KB as a PNG,
  so about 33 MB a step and 800 MB for 24 steps. HRRR CONUS z0 to z8 is about
  4,000 tiles a step, 25 MB, so 1.8 GB for 72 hourly steps. Keep the last
  two runs: about 5 GB.
- **Storage:** Cloudflare R2 (no egress charge) at about $0.015 a GB a month
  is under $0.10 a month for 5 GB. Vercel Blob or S3 behind CloudFront also
  work but charge for egress.
- **Compute:** decoding GRIB2 and writing tiles takes about 2 to 4 minutes
  per GFS cycle and per HRRR hour on a GitHub Actions runner (wgrib2 or
  Python eccodes and Pillow). HRRR every hour is about 720 runs a month,
  inside the free tier for a public repo, but close to its limits for a
  private one (2,000 minutes a month).
- **Egress:** a phone panning one coast pulls about 40 tiles a step, about
  250 KB. 1,000 views a day is about 7.5 GB a month: free on R2.

### Why not now

It needs a storage account and a scheduled job writing outside the repo. The
nightly model-skill job is the only automation that writes anything, and
only to `public/skill/` (CLAUDE.md). Adding this is your call.
