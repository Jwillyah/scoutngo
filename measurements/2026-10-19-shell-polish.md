# The shell polish pass, measured

**Runs:** `node scripts/audit-surface.mjs` and `node scripts/make-cover-frame.mjs`, 2026-10-19
**Viewport:** 390 x 844, deviceScaleFactor 3, mobile
**Venue:** the calibration venue (`?calibration=1&probe=1`)
**Build measured:** the served bundle, confirmed newer than every watched
source file by `servedAppFreshness()`.

Everything below is the audits' own stdout, pasted. Nothing is retyped and
nothing is rounded by hand.

---

## The time strip

The time control was a ~250px panel above every card: a clock, two receipts in
degrees, tide tags, a twilight band, a range input with its own grey track,
and the Part 107 requirements. It is **one row of 34px** now, and only on the
cards whose reading is for a moment.

```
### the time strip is a strip, and only where time matters
  the limit is 2 x 844 = 1688px of content
  card          half     full     worst   of limit   strip
  about           894     894     894     53%  ok    none
  airspace        637     637     637     38%  ok    none
  cams            379     379     379     22%  ok    none
  cloud           238     238     238     14%  ok    34px
  golden          653     653     653     39%  ok    34px
  hazards         459     459     459     27%  ok    none
  layers          608     608     608     36%  ok    none
  shoot           628     628     628     37%  ok    34px
  sky            1262    1262    1262     75%  ok    34px
  suncurve        264     264     264     16%  ok    none
  tide            192     192     192     11%  ok    34px
  wind            325     325     325     19%  ok    34px
  12 kinds declared, 12 reached
  12 cards measured; tallest is sky at 1262px

```

Measured strip height: **34px** on every card that carries it, against a 48px
ceiling. Absent on all five that do not.

**Half and full report the same content height for every card**, which is
correct and worth saying: the detent changes the window, not the document.

## Every card against the two-viewport limit

The limit is 2 x 844 = **1688px**, measured as the scroll height of
`.sheet__card` from the live DOM, per card, at both readable detents.

| card | content | of limit |
|---|---|---|
| sky | 1262 | 75% |
| about | 894 | 53% |
| airspace | 637 | 38% |
| golden | 653 | 39% |
| shoot | 628 | 37% |
| layers | 608 | 36% |
| hazards | 459 | 27% |
| cams | 379 | 22% |
| wind | 325 | 19% |
| suncurve | 264 | 16% |
| cloud | 238 | 14% |
| tide | 192 | 11% |

**Sky was 1589px (94%) and is 1262px (75%).** Removing the time panel did not
do it, and could not have: the panel lived in the sheet's peek slot and the
two-viewport measure has always been of `.sheet__card` alone. What did it was
splitting three subjects off one card — the sun-bearing search to the light
card, the camera list to its own card.

## The cover frame

```
  markers                    3: marker 3, marker 1, marker 2
  labels                     4: [null,null,null]
  composition problems       0
  proof: duplicate + overlap two labels read the same: "SONY 200mm·TRIPOD"
  proof: duplicate + overlap labels overlap: "SONY 200mm·TRIPOD" and "SONY 200mm·TRIPOD"
  proof: label on a marker   "PROOF" is sitting on marker 1
  proof: markers 40px apart  marker 3 and marker 1 are 39px apart, under 90
  proof: outside the safe area "UNDER THE SCRIM" at 40,784-180,802 is outside the safe area (12,48-378,490)
  proof: restored            0 problem(s)
  map is the frame           1 (the map is the frame)
  tiles settled              already idle
  near-black share           0.086

=== COVER FRAME OK: 635 KB -> public/cover-frame.jpg ===
```

Three positions, three platforms, three focal lengths, three altitudes, three
different labels. One cone filled and two outlined. No label on a marker, no
two labels overlapping, every marker and plate inside the band the cover's own
type leaves free, and the nearest pair 170px apart against a 90px floor.

**Each of the five composition checks was shown failing** on a frame broken
for it before the frame was accepted, and the frame re-measured clean
afterwards.

Near-black share of the frame: **0.086**, against a 0.12 ceiling. With terrain
on it was a black cliff across the marina where the DEM has a gap.
