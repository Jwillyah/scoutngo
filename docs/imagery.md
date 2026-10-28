# Aerial imagery in the 3D view: how to add your region

The 3D view drapes aerial photographs over the ground. It draws from the
sharpest free source whose coverage holds the venue, and from Esri's World
Imagery everywhere else and for any tile a source does not have. The list is
one file: [`src/data/imagerySources.ts`](../src/data/imagerySources.ts).

## What a source must be

Test each of these from a browser before you add it. The app runs on
people's phones, so a source that only works from a server is no use.

- **Free, with no key and no account.** Nothing secret in the address.
- **Open to any web page.** Its answers carry
  `Access-Control-Allow-Origin` with the asking page's origin, or `*`.
- **Allowed for this use.** Public domain, or terms that allow free use in an
  app with credit. Skip anything "non-commercial only" or "for viewing on our
  site".
- **Web Mercator.** Either a tile cache at `{z}/{y}/{x}` (`kind: 'xyz'`), or
  an ArcGIS ImageServer `exportImage` or MapServer `export` that draws any
  box (`kind: 'export'`).

Check a tile with curl, sending an origin as a browser would:

```sh
curl -s -D - -o /tmp/tile -H "Origin: https://example.org" \
  "https://example.gov/arcgis/rest/services/Imagery/MapServer/tile/19/200893/152806"
file /tmp/tile        # JPEG or PNG image data, 256 x 256
```

For an `export` source use
`?bbox=XMIN,YMIN,XMAX,YMAX&bboxSR=3857&imageSR=3857&size=256,256&format=jpgpng&transparent=true&f=image`.
With `jpgpng` the service answers with a JPEG where the tile is all picture,
and a transparent PNG where part of it is not. The 3D view lays a PNG over
Esri's tile, so the edge of the coverage has no holes.

## Add it

1. **One entry** in `IMAGERY_SOURCES`:
   - `name`, `year`, `licence` and `attribution`, as the provider states
     them. The 3D view's "i" shows the name and year.
   - `gsdM`: metres of ground per pixel at its best, from the service's own
     description. The sharpest covering source wins.
   - `maxZoom`: the deepest zoom you saw answer with a picture.
   - `coverage`: outer rings of `[lon, lat]`. For a US state use its outline
     from `STATE_OUTLINES`. To add a state, add it to `STATES` in
     `scripts/bake-imagery-coverage.mjs` and run that script.
   - `tested`: the date you tried it.
2. **Its host**, in two places:
   - `src/lib/hosts.ts`, which lists what each host learns and when;
   - the `ALLOWED` set in `scripts/audit-3d-network.mjs`, which fails the
     commit on any request to an unlisted host.
3. **A test** in `src/data/imagerySources.test.ts`: a place inside your
   region, with the source it should pick.

Then run `npm test`. `git commit` runs the whole gate, including the 3D
network audit.

## What each one learns

A tile request tells the provider which map cell is being looked at, as any
map does. It never carries the venue's coordinate, your location or
anything about you.
