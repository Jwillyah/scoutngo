# Comparing the 3D view against real photos

The compare scripts set the owner's own drone photos beside the 3D view at the
same pose and measure how far apart they are (sky colour, the horizon row,
the lit walls). They need the ORIGINAL files: the pose comes from the DJI
metadata (GPS position, height above takeoff, gimbal yaw, pitch and roll, the
lens), which any shared or edited copy has usually lost.

## Where the photos go

    compare-input/

at the root of the repository. It is in `.gitignore`: those files carry GPS
positions and the drone's serial number, so they are never committed and
never published. Nothing in `src/` or `public/` reads from it; only the
scripts below, run by hand on your own machine. Copy the photos in, run the
script, and delete them again if you like.

Nothing is uploaded. The side-by-side pictures a script writes into
`measurements/` are redrawn on a canvas at 720 px, so they carry no EXIF and
no GPS, and positions in the reports are written to four decimals (about 10 m).

## The scripts

    npm run dev                                   # the app on :5173
    node scripts/measure-compare.mjs compare-input/DJI_*.jpg

Each file goes through the app's own Compare screen (the file input is given
the path, as a phone's picker would), so the numbers are the screen's. It
writes `measurements/<date>-compare.md` and one side-by-side per photo in
`measurements/<date>-compare/`.

    node scripts/measure-light-map-oceanfront.mjs

The light map against the 27 Oct 07:37 sunrise frame (DJI_20261027073735_0094_D).

## Photos for the home page

Photos that ARE meant to be published (the home page's four bands) are the
exception, asked for by name: they live in `public/home/` as WebP only, each
stripped of every metadata chunk (`scripts/strip-photo-metadata.mjs` for a
JPEG source, `src/core/homeBands.test.ts` to hold it). The full-size JPEG
sources are not kept in the repository or the build.
